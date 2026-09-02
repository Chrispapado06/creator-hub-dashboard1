-- ICEFALL — PH-08 social, part two: likes, and groups that are about a mountain.
--
-- Two things the owner's Social spec needs that 20260831190000_social.sql did
-- not have. Everything that file decided still holds and is not restated here:
-- the feed is chronological, a promoted row is structurally separate so it is
-- always labelled, and published words are stood behind or deleted — never
-- silently edited.
--
-- ── LIKES ──────────────────────────────────────────────────────────────────
--
-- The owner wants a like ANIMATION, which is a schema requirement disguised as
-- a design one: the client has to toggle at the speed of a finger, and it has
-- to know, in the SAME read that fetched the post, both how many likes the post
-- has and whether the caller is one of them. Anything else and the heart draws
-- empty for a beat and then fills — the exact stutter the animation exists to
-- avoid.
--
-- So: one row per (post, profile), and the pair IS the primary key. No surrogate
-- id, no separate unique index. Liking is one index insert, unliking is one
-- index delete, and "like it twice" is not a race the client has to win — it is
-- a conflict the key refuses.
--
-- The count and the caller's own state are DERIVED, by function, in the style
-- of `identity_verified` (20260831160000): nothing is stored that could drift
-- from what it summarises, which is the same reason `follows` has no follower
-- count column. A stored counter is a number the honesty doctrine cannot vouch
-- for the moment a delete misses it.
--
-- ── GROUPS ─────────────────────────────────────────────────────────────────
--
-- The owner: "Groups where you can add mountain you want to climb and shows you
-- people who are interested climbing with each other."
--
-- Read literally, and it should be: a group is ABOUT A MOUNTAIN. Not about its
-- founder, not a general-purpose chat room that happens to mention a peak. The
-- mountain is a required foreign key to `destinations` — the same text slug
-- ('mont-blanc', 'everest') that `trek_mountains`, `placements` and the two
-- consumer apps already use, so a group joins straight onto the catalogue with
-- no second vocabulary for the same mountain.
--
-- WHAT A GROUP DOES NOT CARRY. No interest score, no "12 people looking", no
-- readiness. It carries the mountain, a name, who made it, when they mean to
-- go — nullable, because a group that has not picked a date yet is the ordinary
-- case and an invented one is the failure — and its members. Everything a
-- screen wants to say about a group is countable from rows in this file or it
-- does not get said.

/* ========================================================================== */
/* Likes                                                                      */
/* ========================================================================== */

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The pair is the identity. This is what makes the toggle cheap AND makes a
  -- double-like structurally impossible rather than merely discouraged.
  primary key (post_id, profile_id)
);

-- The primary key's leading column is post_id, so counting one post's likes is
-- an index-only scan and needs no index of its own. This one covers the other
-- direction — the foreign key (see 20260829200000: an unindexed FK turns every
-- account deletion into a sequential scan) and "posts this person liked".
create index if not exists post_likes_profile_idx on public.post_likes (profile_id, post_id);

comment on table public.post_likes is
  'One row per (post, person). The client toggles it directly: insert to like, '
  'delete to unlike, and `on conflict do nothing` on the insert so a double-tap '
  'during the animation is a no-op instead of an error.';

/* ---- The count is counted, on the row that needed it --------------------- */

/**
 * PostgREST computed field: `posts?select=*,like_count`.
 *
 * DEFINER, following `identity_verified`, for a reason worth stating: an
 * INVOKER count is filtered by the caller's own row-level policy, so the day
 * anyone narrows what a person may read out of `post_likes` this quietly starts
 * returning 3 where the truth is 11. A count that is silently wrong is worse
 * than no count at all — it is exactly the fabricated number the honesty
 * doctrine exists to prevent, arriving through the back door.
 *
 * WHAT IT EXPOSES: a number, for a post id you would have to already know. It
 * does not name a single liker; who liked a post is `post_likes` itself, which
 * has its own policy below. DEFINER here means the same thing it means for
 * `identity_verified` — the derived answer is readable without the evidence
 * behind it being readable.
 *
 * ZERO IS A MEASURED ZERO. A post with no likes is not missing data, and a
 * screen may render "0" honestly — or render nothing, which is a design call,
 * not a truthfulness one.
 */
create or replace function public.like_count(p public.posts)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.post_likes pl where pl.post_id = p.id;
$$;

/**
 * PostgREST computed field: `posts?select=*,liked_by_me`.
 *
 * The other half of the one-round-trip requirement: the heart has to be drawn
 * filled or empty on first paint. Safe as DEFINER by construction — it can only
 * ever report on the caller, because auth.uid() is the only profile it looks at.
 */
create or replace function public.liked_by_me(p public.posts)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.post_likes pl
    where pl.post_id = p.id and pl.profile_id = auth.uid()
  );
$$;

revoke all on function public.like_count(public.posts) from public, anon;
revoke all on function public.liked_by_me(public.posts) from public, anon;
grant execute on function public.like_count(public.posts) to authenticated;
grant execute on function public.liked_by_me(public.posts) to authenticated;

/* ========================================================================== */
/* Groups — one mountain, one intention, some people                          */
/* ========================================================================== */

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  -- The mountain the group is about. RESTRICT, not cascade: if somebody is
  -- tidying the catalogue and a live group is attached to the row they are
  -- removing, that is a conversation, not a silent deletion of other people's
  -- plans. The kind trigger below keeps this a mountain and not a trek.
  destination_id text not null references public.destinations (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  -- NULLABLE ON PURPOSE. The founder's profile going away must not delete a
  -- group other people joined — they joined the mountain, not the person. The
  -- insert policy pins this to auth.uid(), so it is always set at creation and
  -- only ever becomes NULL when that account is deleted. A group in that state
  -- is unowned: it can still be joined and left, and only staff can remove it.
  created_by uuid references public.profiles (id) on delete set null,
  -- When they mean to be there. NULL = not decided, which is most groups on the
  -- day they are made. Nothing may render a guess in its place.
  intended_on date,
  created_at timestamptz not null default now()
);

create index if not exists groups_destination_idx on public.groups (destination_id, created_at desc);
-- NOT partial, even though created_by is null on exactly one kind of row.
-- 20260829200000's warning applies: a partial index reads as foreign-key
-- coverage in review and is not reliably usable for the scan Postgres runs when
-- a profile is deleted, which is the scan that matters here.
create index if not exists groups_created_by_idx on public.groups (created_by);
create index if not exists groups_intended_idx on public.groups (intended_on) where intended_on is not null;

comment on column public.groups.intended_on is
  'The date they intend to go. NULL means undecided — render that as undecided, '
  'never as a placeholder date and never as "TBC 2027".';

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

-- Same shape as post_likes and for the same two reasons: the FK needs an index,
-- and "which groups is this person in" is a question every profile screen asks.
create index if not exists group_members_profile_idx on public.group_members (profile_id, group_id);

comment on table public.group_members is
  'Membership is PUBLIC to signed-in users by design — the whole point of the '
  'feature is showing who wants to climb the same mountain, and it cannot work '
  'if it is private. Joining is therefore a visible act, and the joining screen '
  'should say so rather than let people discover it later.';

/* ---- A group is about a mountain, and stays about that mountain ---------- */

/**
 * `destinations` holds treks as well as mountains (20260829130000 explains why
 * one table), so the foreign key alone does not say "mountain" — it says
 * "anything placeable". The owner asked for mountains, so the trigger asks too,
 * exactly as `trek_mountains_kinds_are_right` does for its half of that table.
 *
 * FLAGGED, NOT DECIDED: whether a group may be about a TREK is a product
 * question the owner has not been asked. Allowing it is deleting the raise
 * below; it is written as one line for that reason.
 */
create or replace function public.groups_destination_is_a_mountain()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.destinations where id = new.destination_id;
  if v_kind is distinct from 'mountain' then
    raise exception '% is not a mountain — a group is about a peak', new.destination_id;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_destination_kind on public.groups;
create trigger groups_destination_kind
  before insert or update on public.groups
  for each row execute function public.groups_destination_is_a_mountain();

/**
 * What can be edited, and what a group is.
 *
 * The name and the date move — a weather window shifts, a group renames itself
 * — but the MOUNTAIN does not, and neither does who made it. Members joined a
 * particular peak; a group that can be pointed at a different one is a bait and
 * switch performed on everybody who is already in it. Making that unstorable is
 * cheaper than trusting every future write path not to do it.
 */
create or replace function public.groups_guard()
returns trigger
language plpgsql
as $$
begin
  if new.destination_id is distinct from old.destination_id then
    raise exception 'a group is about its mountain — make a new group for a different one';
  end if;
  if new.created_by is distinct from old.created_by
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_guard on public.groups;
create trigger groups_guard
  before update on public.groups
  for each row execute function public.groups_guard();

/**
 * The person who made a group is IN it.
 *
 * Otherwise the founder is absent from their own member list and every count
 * has to be `members + 1`, which half the callers will get right.
 *
 * INVOKER, deliberately — no `security definer` here. The row it writes is
 * (this new group, its own creator), and `groups_insert` has already pinned
 * created_by to auth.uid(), so the join passes `group_members_insert` as the
 * caller under ordinary RLS. Making it DEFINER would have made the trigger
 * depend on the owning role bypassing FORCE ROW LEVEL SECURITY — an assumption
 * about how the database is provisioned, smuggled into a rule about who is in
 * a group.
 */
create or replace function public.groups_creator_joins()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is not null then
    insert into public.group_members (group_id, profile_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_creator_joins on public.groups;
create trigger groups_creator_joins
  after insert on public.groups
  for each row execute function public.groups_creator_joins();

/* ---- Group counts, same pattern as likes --------------------------------- */

/**
 * PostgREST computed field: `groups?select=*,member_count`.
 * DEFINER for the same reason `like_count` is: a count filtered by the reader's
 * own policy is a count that can be quietly short.
 */
create or replace function public.member_count(g public.groups)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.group_members gm where gm.group_id = g.id;
$$;

/** PostgREST computed field: `groups?select=*,joined_by_me` — so the Join /
 * Leave button is right on first paint, without a second request. */
create or replace function public.joined_by_me(g public.groups)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = g.id and gm.profile_id = auth.uid()
  );
$$;

revoke all on function public.member_count(public.groups) from public, anon;
revoke all on function public.joined_by_me(public.groups) from public, anon;
grant execute on function public.member_count(public.groups) to authenticated;
grant execute on function public.joined_by_me(public.groups) to authenticated;

/* ========================================================================== */
/* Delete audit — a group holds other people's plans                          */
/* ========================================================================== */

-- Same stance as the post delete audit: deletion is a real power (a creator
-- owns what they made, staff moderate), so every use of it leaves a trace and
-- moderation stays reviewable. Leaving a group is not moderation and is not
-- audited — that would be logging people for changing their minds.
create or replace function public.groups_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'group.deleted',
     'group', old.id::text, to_jsonb(old), null);
  return old;
end;
$$;

drop trigger if exists groups_delete_audit on public.groups;
create trigger groups_delete_audit
  after delete on public.groups
  for each row execute function public.groups_delete_audit();

/* ========================================================================== */
/* RLS + grants — written together, §6v                                       */
/* ========================================================================== */

alter table public.post_likes enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.post_likes force row level security;
alter table public.groups force row level security;
alter table public.group_members force row level security;

-- NOTE ON `(select auth.uid())`. 20260829210000 rewrote every policy to this
-- form: called bare, auth.uid() is evaluated once PER ROW checked; wrapped in a
-- scalar subquery it becomes an InitPlan evaluated once for the query. These
-- three tables are the ones that grow one row per tap, so they are written that
-- way from the start rather than needing the same sweep later.

/* ---- post_likes ---------------------------------------------------------- */

-- Visible wherever the post is visible — the subquery rides `posts_select`
-- because it runs as the caller. That means an ended story's likes leave with
-- the story, and a feed can show who liked what it can already show.
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- You like as yourself, on a post you can see, not past a block, and not on a
-- story that has already ended — the same four conditions as commenting.
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and (p.expires_at is null or p.expires_at > now())
        and not public.blocked_between(p.author_id)
    )
  );

-- Unliking is only ever your own like. Staff are NOT included: a like is not a
-- statement anyone needs moderated, and the moderation act on a bad post is
-- deleting the post, which takes its likes with it.
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- No UPDATE policy and no UPDATE grant: a like has nothing to change into.

/* ---- groups -------------------------------------------------------------- */

-- Discoverable to every signed-in person. A group exists to be FOUND by the
-- next person who wants that mountain; a private-by-default group is the
-- feature not working.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (true);

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- The creator keeps the name and the date current. The guard trigger above
-- decides what an update is allowed to touch; this only decides who may try.
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (created_by = (select auth.uid()) or public.is_staff())
  with check (created_by = (select auth.uid()) or public.is_staff());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_staff());

/* ---- group_members ------------------------------------------------------- */

-- Public to signed-in users, because "shows you people who are interested
-- climbing with each other" is the entire feature and it cannot be delivered
-- from rows people cannot read.
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (true);

-- You join yourself. Nobody is added to a group by somebody else, so there is
-- no invitation to decline and no list to be put on without knowing.
--
-- NO BLOCK CHECK HERE, DELIBERATELY. Blocks gate the places one person speaks
-- to another — comments, follows, offers. A group is about a mountain, and
-- gating membership on the founder's block list would let any one person lock
-- others out of a peak. Blocks still do their work where the talking happens.
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

-- Leaving is your own, always. Staff can remove a member (moderation).
--
-- FLAGGED, NOT DECIDED: whether a group's CREATOR may remove somebody is a
-- moderation power the owner has not been asked for, so it is not here. Today
-- an unwanted member is a staff matter.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_staff());

/* ---- grants (a policy permits; a grant makes the privilege exist) -------- */

-- `revoke ... from public` does NOT cover anon: default privileges grant to
-- PUBLIC, and anon inherits them. Both roles are named, every time.
revoke all on public.post_likes from anon, authenticated;
revoke all on public.groups from anon, authenticated;
revoke all on public.group_members from anon, authenticated;

grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;

/* ========================================================================== */
/* Realtime — and why likes are not in it                                     */
/* ========================================================================== */

-- `posts` and `post_comments` are published (20260831190000). `post_likes` is
-- deliberately NOT: it is the highest-frequency table in the social schema, and
-- publishing it makes every tap a broadcast to every subscriber of the feed for
-- a number the client already holds optimistically and re-reads with the post.
-- The animation is local; it does not need the network to be fast.
--
-- Groups are published: a new member appearing while you are looking at a group
-- is low-volume and is the moment the feature is actually about.
do $$
begin
  begin
    alter publication supabase_realtime add table public.group_members;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end;
$$;
