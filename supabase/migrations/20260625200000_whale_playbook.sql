-- Whale playbook — the bot's "knowledge" for the chatter assist:
-- numbered scripts/questions/openers chatters can apply when a whale replies.
-- + a `current_topic` field on whale_paydays so the team can set "talk about X
--   with this whale today" via /whale topic.
--
-- When the whale-active flag fires, the bot now also surfaces:
--   • the whale's current_topic (if set)
--   • one rotating playbook entry (Option A; AI-pick is the B upgrade later)

create table if not exists public.whale_playbook (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                -- e.g. "White Knight Q5"
  category   text,                          -- e.g. "white_knight", "opener", "tease"
  text       text not null,                 -- the actual script/question
  active     boolean not null default true, -- so we can soft-disable without deleting
  added_by   text,                          -- Discord username who added (audit)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whale_playbook_active_idx   on public.whale_playbook (active);
create index if not exists whale_playbook_category_idx on public.whale_playbook (category);

alter table public.whale_playbook enable row level security;
drop policy if exists "service role full access" on public.whale_playbook;
create policy "service role full access" on public.whale_playbook
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop trigger if exists trg_whale_playbook_updated on public.whale_playbook;
create trigger trg_whale_playbook_updated
  before update on public.whale_playbook
  for each row execute function public.set_updated_at();

-- Per-whale current topic (what to discuss with this whale today).
alter table public.whale_paydays
  add column if not exists current_topic text;
