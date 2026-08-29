-- Treks: raise the duration ceiling from 200 days to 400.
--
-- WHY. Loading the real trek catalogue (252 records) failed on exactly one row:
-- the Appalachian Trail, 150-210 days. The data is correct — a thru-hike of the
-- AT genuinely runs five to seven months — and the constraint was wrong. 200 was
-- chosen when the catalogue was Alpine treks of one to three weeks, and it
-- quietly encoded that assumption as a rule.
--
-- The alternative was to clamp the trail to 200 days so it would load. That is
-- the failure this codebase keeps naming: a number the product cannot support is
-- replaced by one it can, the load succeeds, and the app then states a duration
-- for a real trail that is false by six weeks. A constraint exists to refuse bad
-- data, not to launder good data into a shape it fits.
--
-- 400 is not another arbitrary ceiling dressed up as a considered one: it is
-- roughly double the longest record we hold, which leaves room for the Pacific
-- Crest and Continental Divide trails (both longer than the AT) without the
-- column becoming a free-text field where a typo of 90000 days passes silently.
--
-- The lower bound stays at 1. A trek of zero days is not a short trek.

alter table public.destinations
  drop constraint if exists destinations_duration_days_min_check,
  drop constraint if exists destinations_duration_days_max_check;

alter table public.destinations
  add constraint destinations_duration_days_min_check
    check (duration_days_min is null or (duration_days_min >= 1 and duration_days_min <= 400)),
  add constraint destinations_duration_days_max_check
    check (duration_days_max is null or (duration_days_max >= 1 and duration_days_max <= 400));

comment on column public.destinations.duration_days_min is
  'Typical shortest itinerary, in days. 1-400: the ceiling accommodates thru-hikes such as the Appalachian Trail (150-210 days), not just Alpine treks.';
comment on column public.destinations.duration_days_max is
  'Typical longest itinerary, in days. Never below duration_days_min.';
