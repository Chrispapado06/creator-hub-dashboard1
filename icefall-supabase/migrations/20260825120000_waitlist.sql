-- ICEFALL — pre-launch waitlist
--
-- The one table the marketing site writes to (`icefall-web/api/_waitlist.mjs`).
-- It holds nothing but a name, an email address and where the person signed up
-- from, and it is written by the anonymous role, so the shape of its privileges
-- matters more than the shape of its columns.
--
-- THE RULE: this table is INSERT-ONLY to the public.
--
-- Anyone on the internet may add themselves. Nobody reachable from the browser
-- may read, change or delete a single row — not the person who wrote it, not an
-- authenticated user, not a leaked publishable key. A list of customer email
-- addresses that anon can SELECT is a list of customer email addresses that has
-- been published. Reading it is a service-role operation: the dashboard, or a
-- deliberate export.
--
-- Belt and braces on purpose: RLS grants no read policy AND the table-level
-- SELECT privilege is revoked. Supabase's default privileges hand `anon` full
-- access to every new table in `public`, so leaving either one out is enough to
-- open the list.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  source text,
  created_at timestamptz not null default now(),

  -- Lowercased and trimmed by the API before it ever gets here; the constraint
  -- is what makes `unique (email)` mean "one person", not "one spelling".
  constraint waitlist_email_normalised check (email = lower(btrim(email))),
  constraint waitlist_email_shape check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint waitlist_email_length check (char_length(email) between 6 and 254),
  constraint waitlist_name_length check (name is null or char_length(name) <= 80),
  constraint waitlist_source_known check (source is null or source in ('hero', 'footer', 'header', 'unknown'))
);

comment on table public.waitlist is
  'Pre-launch signups from icefall-web. Insert-only to anon; readable by service_role only.';

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

-- Privileges: nothing, then INSERT and nothing else.
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;

-- The only policy on this table. There is no SELECT, UPDATE or DELETE policy,
-- and adding one is the deliberate act that exposes the list.
drop policy if exists "anyone may join the waitlist" on public.waitlist;
create policy "anyone may join the waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);
