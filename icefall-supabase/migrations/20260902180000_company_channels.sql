/* ==========================================================================
 * Company channels — an expedition company broadcasts, members listen.
 *
 * The owner's model, in their words: "like on instagram when creators create
 * channels". A company posts promotional content and offers; a climber joins if
 * they want to hear it; MEMBERS CANNOT REPLY; and the company can see how many
 * people saw each message.
 *
 * HOW "CANNOT REPLY" IS ENFORCED: BY ABSENCE.
 * There is no replies table, no member-writable column, and no insert policy on
 * `channel_messages` that a non-admin can satisfy. A read-only channel built as
 * "a chat with replies disabled in the UI" is one forgotten prop away from
 * being a chat again; a channel with nowhere to put a reply cannot become one.
 * If two-way conversation is ever wanted, that is `threads`/`messages` from
 * 20260818090000 — a different feature with a different name.
 *
 * VIEW COUNTS ARE COUNTED, NOT ESTIMATED.
 * `channel_message_views` holds one row per person per message, so the number
 * on a message is the number of distinct people who opened it — a fact, not a
 * projection. That is also the only shape that can never double-count a person
 * who reads a message twice, which an incrementing counter always eventually
 * does. The cost is a row per read; the benefit is a figure the company can
 * stand behind, which is the whole reason it is being shown to them.
 *
 * WHO IS COUNTED IS NOT WHO IS NAMED. `channel_message_views` is readable only
 * as an aggregate by the company (see the view below) — a company learning that
 * a specific named climber read a specific promotional message at a specific
 * time is surveillance, not analytics, and nobody joining a channel expects it.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* channels                                                                   */
/* -------------------------------------------------------------------------- */

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  description text check (description is null or length(trim(description)) <= 300),
  -- Storage path in `operator-media`, which is already company-scoped.
  cover_path text,
  /* Archived, never deleted: members joined something and a company should not
     be able to make that disappear from under them mid-conversation. An
     archived channel stops accepting messages and stays readable. */
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint channels_name_unique unique (company_id, name)
);

create index if not exists channels_company_idx
  on public.channels (company_id, created_at desc);

/* -------------------------------------------------------------------------- */
/* channel_members                                                            */
/* -------------------------------------------------------------------------- */

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  /* Muted, not left: someone who wants the offers but not the notifications
     should not have to leave to get quiet. */
  muted boolean not null default false,
  primary key (channel_id, profile_id)
);

create index if not exists channel_members_profile_idx
  on public.channel_members (profile_id);

/* -------------------------------------------------------------------------- */
/* channel_messages                                                           */
/* -------------------------------------------------------------------------- */

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  /* The person who pressed send, always — a company does not press buttons.
     Kept so a promotional claim traces to a human, exactly as `posts` does. */
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 2000),
  media_path text,
  media_meta jsonb,
  /*
   * WHAT A CHANNEL MESSAGE PROMOTES — a product, NEVER an `offers` row.
   *
   * This first pointed at `offers`, and that was wrong in a way worth writing
   * down. An offer in this schema is a PERSONAL, ADDRESSED, ONE-OUTCOME
   * commercial instrument: `thread_id` is NOT NULL, there is exactly one
   * `recipient_id`, and `accepted_at`/`declined_at`/`withdrawn_at` are mutually
   * exclusive — it is a quote made to one named climber inside one
   * conversation. A broadcast to 1,200 channel members has no thread and
   * cannot be accepted 1,200 times. Attaching one would have looked right
   * until the first person accepted it and everybody else's copy went stale.
   *
   * So a channel message promotes something PURCHASABLE — a product, and
   * optionally one departure of it. A member who wants it enquires, which
   * opens a thread, which is where a real offer belongs. Broadcast and quote
   * stay different objects because they behave differently.
   *
   * `restrict`: a product cannot be deleted out from under a message that has
   * already told people about it. Retire the product instead.
   */
  product_id uuid references public.products (id) on delete restrict,
  departure_id uuid references public.product_departures (id) on delete restrict,
  /* Promotional terms in the seller's own words — "15% off if you book before
     March". Deliberately free text and NOT a price or a discount column: a
     number here would be an unenforceable commitment sitting outside the
     money model, and every real figure belongs to the product or to an offer
     made in a thread. */
  promo_note text check (promo_note is null or length(trim(promo_note)) <= 300),
  constraint channel_messages_departure_needs_product check (
    departure_id is null or product_id is not null
  ),
  created_at timestamptz not null default now()
);

create index if not exists channel_messages_channel_idx
  on public.channel_messages (channel_id, created_at desc);

/* -------------------------------------------------------------------------- */
/* channel_message_views                                                      */
/* -------------------------------------------------------------------------- */

create table if not exists public.channel_message_views (
  message_id uuid not null references public.channel_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists channel_message_views_message_idx
  on public.channel_message_views (message_id);

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;
alter table public.channel_message_views enable row level security;

-- A channel is discoverable so somebody can decide to join it.
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (true);

drop policy if exists channels_write on public.channels;
create policy channels_write on public.channels
  for insert to authenticated
  with check (public.is_company_admin(company_id));

drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- You join yourself and you leave yourself. A company cannot add members: an
-- audience it assembled is a mailing list, and nobody consented to that.
drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.channels c
       where c.id = channel_id and public.is_company_member(c.company_id)
    )
  );

drop policy if exists channel_members_join on public.channel_members;
create policy channel_members_join on public.channel_members
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists channel_members_update on public.channel_members;
create policy channel_members_update on public.channel_members
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists channel_members_leave on public.channel_members;
create policy channel_members_leave on public.channel_members
  for delete to authenticated
  using (profile_id = auth.uid());

-- Members read. Company members read their own channel's messages.
drop policy if exists channel_messages_select on public.channel_messages;
create policy channel_messages_select on public.channel_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.channel_members m
       where m.channel_id = channel_messages.channel_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.channels c
       where c.id = channel_messages.channel_id and public.is_company_member(c.company_id)
    )
    or public.is_staff()
  );

/*
 * THE ONLY WRITE PATH, AND IT IS ADMIN-ONLY. This is where "members cannot
 * reply" actually lives. Note there is deliberately no `channel_messages`
 * UPDATE policy either — a promotional claim is stood behind or deleted, the
 * same rule `posts` follows, so nothing can be quietly edited after people
 * have read it and the view count has accrued against the old words.
 */
drop policy if exists channel_messages_insert on public.channel_messages;
create policy channel_messages_insert on public.channel_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.channels c
       where c.id = channel_id
         and c.archived_at is null
         and public.is_company_admin(c.company_id)
    )
  );

drop policy if exists channel_messages_delete on public.channel_messages;
create policy channel_messages_delete on public.channel_messages
  for delete to authenticated
  using (
    exists (
      select 1 from public.channels c
       where c.id = channel_messages.channel_id and public.is_company_admin(c.company_id)
    )
  );

/*
 * A view is recorded by the person who did the viewing, for themselves, and
 * read back by nobody at row level. The company sees the COUNT through
 * `channel_message_stats` below; it never sees the rows, so it cannot learn
 * that a named climber opened a named offer at a named time.
 */
drop policy if exists channel_message_views_insert on public.channel_message_views;
create policy channel_message_views_insert on public.channel_message_views
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.channel_members m
       join public.channel_messages msg on msg.channel_id = m.channel_id
      where msg.id = message_id and m.profile_id = auth.uid()
    )
  );

drop policy if exists channel_message_views_select on public.channel_message_views;
create policy channel_message_views_select on public.channel_message_views
  for select to authenticated
  using (profile_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* The aggregate the company is allowed to see                                */
/* -------------------------------------------------------------------------- */

/*
 * `security_invoker = off` on purpose: the whole point is to expose a COUNT
 * over rows the caller must not read individually. The view is the boundary
 * between "148 people saw this" and "these 148 people saw this".
 */
create or replace view public.channel_message_stats
  with (security_invoker = off) as
  select
    msg.id            as message_id,
    msg.channel_id    as channel_id,
    count(v.profile_id)::bigint as views
  from public.channel_messages msg
  left join public.channel_message_views v on v.message_id = msg.id
  group by msg.id, msg.channel_id;

comment on view public.channel_message_stats is
  'Distinct viewers per channel message. Aggregate only — the underlying rows are not readable by the company, so a view count can never be turned back into a list of who read what.';

/* -------------------------------------------------------------------------- */
/* Table privileges                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Revoked from `anon, authenticated` by name rather than from `public`: default
 * privileges grant `public`, so revoking only from it leaves anon holding
 * access. Note the shape of what is granted below — it IS the feature:
 * `channel_messages` gets select, insert and delete but NO UPDATE, and
 * `channel_message_views` gets select and insert but no delete, so a view
 * cannot be un-counted.
 */
revoke all on public.channels from anon, authenticated;
revoke all on public.channel_members from anon, authenticated;
revoke all on public.channel_messages from anon, authenticated;
revoke all on public.channel_message_views from anon, authenticated;
revoke all on public.channel_message_stats from anon, authenticated;

grant select, insert, update on public.channels to authenticated;
grant select, insert, update, delete on public.channel_members to authenticated;
grant select, insert, delete on public.channel_messages to authenticated;
grant select, insert on public.channel_message_views to authenticated;
grant select on public.channel_message_stats to authenticated;
