-- Staff roster — country, gender, and onboarding status.
--
-- Adds the fields the new card-view roster needs:
--   country  — ISO 3166-1 alpha-2 country code (e.g. "US", "PH", "AR")
--              for the flag chip on the staff card. Plain text so the
--              UI controls the picker; nothing in the DB layer cares.
--   gender   — informational only, drives the ♂/♀ chip next to the
--              name. Free-text with a permissive check; allow null
--              so legacy rows aren't forced to declare.
--
-- And expands the status enum to include 'onboarding' so newly-hired
-- chatters in training have a distinct state from full active.
-- The migration below drops the old CHECK and re-creates it with the
-- new value list — no row backfill needed since 'onboarding' is purely
-- additive.

-- Add the new columns idempotently.
alter table public.chatters
  add column if not exists country text,
  add column if not exists gender  text;

-- Replace the status CHECK constraint to allow 'onboarding'.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'chatters'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%status%';
  if con_name is not null then
    execute format('alter table public.chatters drop constraint %I', con_name);
  end if;
end $$;

alter table public.chatters
  add constraint chatters_status_check
  check (status in ('active', 'paused', 'inactive', 'onboarding'));

-- Light gender check — male / female / other / null.
alter table public.chatters
  drop constraint if exists chatters_gender_check;
alter table public.chatters
  add constraint chatters_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));
