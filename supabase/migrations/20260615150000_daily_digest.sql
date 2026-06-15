-- OnlyFinder Experiment Tracker — Stage 4: daily digest storage (Section 7)
--
-- One row per day. Stores BOTH halves the brief asks for: `items` (the per-
-- experiment JSON the dashboard renders) and `prose_summary` (the short
-- narrative). `model` records which model produced it for auditability.

create table if not exists public.daily_digests (
  id            uuid primary key default gen_random_uuid(),
  digest_date   date not null,
  prose_summary text not null default '',
  items         jsonb not null default '[]'::jsonb,  -- DigestItem[] (see digest.ts)
  model         text,
  created_at    timestamptz not null default now(),
  unique (digest_date)                                -- one digest per day; upsert on conflict
);
create index if not exists daily_digests_date_idx on public.daily_digests (digest_date desc);

alter table public.daily_digests enable row level security;
drop policy if exists "Public full access" on public.daily_digests;
create policy "Public full access" on public.daily_digests for all using (true) with check (true);
