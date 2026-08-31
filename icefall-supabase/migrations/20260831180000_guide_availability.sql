-- ICEFALL — guide availability: dated, and a row means the guide SPOKE.
--
-- `guide_profiles.availability` is one enum for the whole person; it cannot
-- say "I am free in September". This is request 06 §2's shape, taken as
-- proposed because the two rules in it are the ones that matter:
--
--   A ROW MEANS THE GUIDE SPOKE. "I have not said" and "I am busy" are
--   different statements, and only one is a refusal of work. There is no
--   'not_set' state — not-set is the ABSENCE of a row, and clearing a day is
--   a DELETE. (The athlete app deletes the key rather than storing a default
--   for exactly this reason.)
--
--   'booked' IS DELIBERATELY NOT A STATE. Booked days derive from `bookings`,
--   so the calendar can never disagree with the trips. The database cannot
--   enforce the overlap itself yet — bookings carry a start date but no end
--   date — so the apps enforce it and THIS comment is honest about where that
--   rule lives. When bookings gain an end date, the refusal moves here.

create table if not exists public.guide_availability (
  guide_profile_id uuid not null references public.guide_profiles (id) on delete cascade,
  day date not null,
  state text not null check (state in ('available', 'unavailable')),
  note text check (note is null or length(trim(note)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guide_profile_id, day)
);

create index if not exists guide_availability_day_idx on public.guide_availability (day);

drop trigger if exists guide_availability_touch on public.guide_availability;
create trigger guide_availability_touch before update on public.guide_availability
  for each row execute function public.touch_updated_at();

comment on table public.guide_availability is
  'One row per day the guide has SPOKEN about. Absence means "not said", never '
  '"unavailable"; clearing a day is a delete. booked is not a state — it derives '
  'from bookings so the calendar cannot disagree with the trips.';

/* ---- RLS + grants (§6v) --------------------------------------------------- */

alter table public.guide_availability enable row level security;
alter table public.guide_availability force row level security;

-- A LISTED guide's calendar is what athletes plan against; an unlisted
-- guide's words are their own (and staff's). Same visibility rule as the
-- profile the calendar belongs to.
drop policy if exists guide_availability_select on public.guide_availability;
create policy guide_availability_select on public.guide_availability
  for select to authenticated
  using (
    guide_profile_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.guide_profiles g
      where g.id = guide_profile_id and g.listed
    )
  );

-- Only the guide writes their own days — availability is the guide speaking,
-- so nobody may speak it for them, staff included. (Staff needing to stop a
-- listing have the listing itself; they do not get to say "he is free".)
drop policy if exists guide_availability_write on public.guide_availability;
create policy guide_availability_write on public.guide_availability
  for insert to authenticated
  with check (guide_profile_id = auth.uid());

drop policy if exists guide_availability_update on public.guide_availability;
create policy guide_availability_update on public.guide_availability
  for update to authenticated
  using (guide_profile_id = auth.uid())
  with check (guide_profile_id = auth.uid());

drop policy if exists guide_availability_delete on public.guide_availability;
create policy guide_availability_delete on public.guide_availability
  for delete to authenticated
  using (guide_profile_id = auth.uid());

revoke all on public.guide_availability from anon, authenticated;
grant select, insert, update, delete on public.guide_availability to authenticated;
