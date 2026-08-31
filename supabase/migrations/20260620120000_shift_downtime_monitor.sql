-- Shift Downtime Monitor
-- =======================
-- Detects fan messages left unanswered on shift and escalates in Discord at
-- 5 / 10 / 20 minutes. Adds two tables:
--
--   shift_program   — who is on shift (chatter + QA) for which OF account, and
--                     when. Synced from the ops Google Sheet. This is how the
--                     monitor knows WHO to ping.
--   downtime_alerts — append-only ledger of every escalation fired. The UNIQUE
--                     constraint gives cross-run idempotency so each breach
--                     fires each level exactly once.
--
-- Account TIER (the 10-min rule only fires for A/B tier) and each account's
-- "respective" Discord channel live in code (shift-downtime-monitor/config.mjs),
-- following the existing payout-bot CREATORS convention, not in these tables.

-- ── shift_program ───────────────────────────────────────────────────────────
-- One row per (account, shift window). `of_account_id` is the OnlyFans API
-- "acct_..." id — the authoritative key the monitor matches on (it iterates the
-- payout-bot CREATORS config, which is keyed by acct id). `creator_id` is an
-- optional FK for dashboard joins. `chatter_id` is the person chatting the
-- account this shift; `qa_chatter_id` is the QA on shift. Both reference
-- chatters so we can resolve their `discord_user_id` at alert time.
create table if not exists public.shift_program (
  id            uuid primary key default gen_random_uuid(),
  of_account_id text not null,
  creator_id    uuid references public.creators(id) on delete set null,
  chatter_id    uuid references public.chatters(id) on delete set null,
  qa_chatter_id uuid references public.chatters(id) on delete set null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  source        text not null default 'google_sheet',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists shift_program_account_window_idx
  on public.shift_program (of_account_id, start_at, end_at);

alter table public.shift_program enable row level security;
drop policy if exists "Public full access" on public.shift_program;
create policy "Public full access" on public.shift_program
  for all using (true) with check (true);

drop trigger if exists trg_shift_program_updated on public.shift_program;
create trigger trg_shift_program_updated before update on public.shift_program
  for each row execute function public.set_updated_at();

-- ── downtime_alerts ─────────────────────────────────────────────────────────
-- Every escalation the monitor fires lands here. `fan_message_at` is the
-- createdAt of the oldest unanswered fan message that triggered the breach — it
-- doubles as the "episode" key: while that message stays unanswered the key is
-- stable, so re-runs don't re-alert. `level`: 1 = 5 min, 2 = 10 min, 3 = 20 min.
create table if not exists public.downtime_alerts (
  id             uuid primary key default gen_random_uuid(),
  of_account_id  text not null,
  creator_name   text,
  fan_id         text not null,
  fan_username   text,
  fan_message_at timestamptz not null,
  level          smallint not null check (level in (1, 2, 3)),
  waited_seconds integer,
  chatter_id     uuid references public.chatters(id) on delete set null,
  qa_chatter_id  uuid references public.chatters(id) on delete set null,
  notified_at    timestamptz not null default now(),
  unique (of_account_id, fan_id, fan_message_at, level)
);

create index if not exists downtime_alerts_account_time_idx
  on public.downtime_alerts (of_account_id, notified_at desc);

alter table public.downtime_alerts enable row level security;
drop policy if exists "Public full access" on public.downtime_alerts;
create policy "Public full access" on public.downtime_alerts
  for all using (true) with check (true);
