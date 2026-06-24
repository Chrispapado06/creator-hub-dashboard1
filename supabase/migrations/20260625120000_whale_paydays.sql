-- Whale paydays — single source of truth for the per-whale payday cards used
-- by /whale (Bernard slash-command) and the shift-downtime monitor's per-shift
-- payday reminders. Replaces the local whale-paydays.json (kept as a fallback).
create table if not exists public.whale_paydays (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  model       text not null,
  payday      text not null check (payday in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  handling    text not null default 'SELL' check (handling in ('DO_NOT_SELL','PRE_SELL','REVIVE','SELL')),
  note        text,
  last_objection text,
  fan_id      text,
  added_by    text,                                  -- Discord username who added (audit)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (lower(name), lower(model))                 -- prevent dupes; one row per whale/model
);

create index if not exists whale_paydays_model_idx  on public.whale_paydays (lower(model));
create index if not exists whale_paydays_payday_idx on public.whale_paydays (payday);
create index if not exists whale_paydays_name_idx   on public.whale_paydays (lower(name));

alter table public.whale_paydays enable row level security;
-- Service-role only (Bernard + the monitor). No public access.
drop policy if exists "service role full access" on public.whale_paydays;
create policy "service role full access" on public.whale_paydays
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop trigger if exists trg_whale_paydays_updated on public.whale_paydays;
create trigger trg_whale_paydays_updated
  before update on public.whale_paydays
  for each row execute function public.set_updated_at();
