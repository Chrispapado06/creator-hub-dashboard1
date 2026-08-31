-- ICEFALL — S2 social: posts, comments, follows, promoted placements.
--
-- The feed is CHRONOLOGICAL, by decision — no ranking, no engagement
-- optimisation, and therefore no counters to inflate. A promoted row is the
-- only non-chronological thing that can appear in it, and it exists in its
-- own table so a client cannot render one without knowing it is promoted:
-- the label is structural, not a flag a renderer might forget.
--
-- WHO A POST IS FROM. Three author kinds, one accountability rule:
-- `author_id` is ALWAYS the human who wrote it (auth.uid(), policy-pinned).
-- 'company' additionally names the company being spoken for, and the policy
-- requires ACTIVE MEMBERSHIP at posting time; 'guide' requires the author to
-- actually hold a guide profile. Nobody posts as somebody they are not, and a
-- company post always traces to the person who pressed the button.
--
-- STORIES are posts with an expiry, not a second table: `expires_at` set →
-- the row leaves everyone else's read policy at that moment, no job needed.
-- The author (and staff) can still see their own expired stories.
--
-- NO UPDATE PATH EXISTS on posts or comments — no grant, no policy, the
-- enquiries pattern. Published words are either stood behind or deleted;
-- silent edits under replies are how a feed becomes a liability. Deletes are
-- real (authors own their words) and every delete leaves an audit trace, so
-- moderation is reviewable.

/* ========================================================================== */
/* Posts                                                                      */
/* ========================================================================== */

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_kind text not null default 'profile'
    check (author_kind in ('profile', 'company', 'guide')),
  -- Set exactly when speaking for a company; membership is checked at write.
  company_id uuid references public.companies (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  media_path text,
  media_meta jsonb,
  -- A story is a post that ends. NULL = permanent post.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint posts_company_coherent check (
    (author_kind = 'company' and company_id is not null)
    or (author_kind <> 'company' and company_id is null)
  ),
  constraint posts_expiry_sane check (expires_at is null or expires_at > created_at)
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_company_idx on public.posts (company_id, created_at desc)
  where company_id is not null;

comment on column public.posts.expires_at is
  'Set = a story: it leaves everyone else''s read policy at this moment, no job '
  'needed. The author and staff can still see it — your own history is yours.';

/* ========================================================================== */
/* Comments                                                                   */
/* ========================================================================== */

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at asc);

/* ========================================================================== */
/* Follows                                                                    */
/* ========================================================================== */

-- A follow targets a person OR a company, exactly one. A guide is a person
-- (guide_profiles.id = profiles.id), so following a guide is the profile arm.
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_profile_id uuid references public.profiles (id) on delete cascade,
  followed_company_id uuid references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_one_target check (
    (followed_profile_id is not null)::int + (followed_company_id is not null)::int = 1
  ),
  constraint follows_not_self check (followed_profile_id is distinct from follower_id)
);

create unique index if not exists follows_profile_key
  on public.follows (follower_id, followed_profile_id) where followed_profile_id is not null;
create unique index if not exists follows_company_key
  on public.follows (follower_id, followed_company_id) where followed_company_id is not null;
create index if not exists follows_followed_profile_idx
  on public.follows (followed_profile_id) where followed_profile_id is not null;
create index if not exists follows_followed_company_idx
  on public.follows (followed_company_id) where followed_company_id is not null;

-- Counts are COUNTED, never stored: a follower count column is a number that
-- can drift from the truth it summarises, and "real counts, no forecasts" is
-- the promotion rule's exact wording.

/* ========================================================================== */
/* Promoted placements — the one labelled, paid thing in the feed             */
/* ========================================================================== */

-- Exists as its OWN table so a promoted row cannot be mistaken for an organic
-- one: a client that renders it got it from here and knows what it is.
--
-- CR-17 rules carried into the schema: targeting is by the audience's own
-- DECLARED goals (their words, their objectives — never inferred), premium
-- members are excluded from promotion delivery (a feed rule the reading apps
-- enforce; recorded here so the contract is on the row), and nothing in this
-- table forecasts anything.
create table if not exists public.promoted_placements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- What is being promoted: one of the company's posts, or one of its products.
  post_id uuid references public.posts (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  -- Audience by their own declared objectives; empty = everyone (non-premium).
  declared_goals text[] not null default '{}',
  -- TARGETED = people whose declared goals name the promoted mountain/trek;
  -- GENERAL = everyone (non-premium). The reading apps apply the rule against
  -- the goals they hold; a server-side reach count for targeted mode waits on
  -- goals syncing to the server, and no screen may invent one meanwhile.
  audience_mode text not null default 'general'
    check (audience_mode in ('targeted', 'general')),
  -- Focus countries, ISO-3166 alpha-2, empty = worldwide. Matched against
  -- profiles.country_code, which people set themselves.
  countries text[] not null default '{}',
  -- What the campaign spends per day, integer cents (the money rule). The
  -- campaign's total is days × daily — DERIVED where displayed, never stored.
  daily_budget_cents int check (daily_budget_cents is null or daily_budget_cents > 0),
  -- The image the promotion shows: a destination photo path or the promoted
  -- post's own media. A reference, not an upload — media lives in storage.
  creative_path text,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'ended', 'suspended')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promoted_one_target check (
    (post_id is not null)::int + (product_id is not null)::int = 1
  ),
  constraint promoted_dates_ordered check (starts_on <= ends_on)
);

create index if not exists promoted_active_idx
  on public.promoted_placements (status, starts_on, ends_on);

comment on table public.promoted_placements is
  'The only non-chronological thing a feed may contain, structurally separate so '
  'it is always labelled. Delivery excludes premium members (feed rule, enforced '
  'by the reading apps). Targeting is by DECLARED goals only. No forecasts, no '
  'engagement metrics — counts are counted where they are needed.';

/* ========================================================================== */
/* Reports learn about posts                                                  */
/* ========================================================================== */

-- The reports table predates the feed (chat migration) and could name a person
-- or a thread. A feed adds the third thing people report. SET NULL, not
-- cascade: the report about a deleted post is still a report — the deletion
-- may be exactly what it achieved, and the moderation queue must not lose the
-- record of why.
alter table public.reports
  add column if not exists post_id uuid references public.posts (id) on delete set null;

create index if not exists reports_post_idx on public.reports (post_id) where post_id is not null;

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

/** Is there a block in either direction between the caller and this person?
 * Same symmetric stance as messaging: a block ends the interaction both ways. */
create or replace function public.blocked_between(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true from public.blocks b
    where (b.blocker_id = other and b.blocked_id = auth.uid())
       or (b.blocker_id = auth.uid() and b.blocked_id = other)
    limit 1
  ), false);
$$;

revoke all on function public.blocked_between(uuid) from public, anon;
grant execute on function public.blocked_between(uuid) to authenticated;

/* ========================================================================== */
/* Delete audit — moderation must be reviewable                               */
/* ========================================================================== */

create or replace function public.posts_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'),
     case when tg_table_name = 'posts' then 'post.deleted' else 'post_comment.deleted' end,
     case when tg_table_name = 'posts' then 'post' else 'post_comment' end,
     old.id::text, to_jsonb(old), null,
     case when tg_table_name = 'posts' then old.company_id else null end);
  return old;
end;
$$;

drop trigger if exists posts_delete_audit on public.posts;
create trigger posts_delete_audit
  after delete on public.posts
  for each row execute function public.posts_delete_audit();

drop trigger if exists post_comments_delete_audit on public.post_comments;
create trigger post_comments_delete_audit
  after delete on public.post_comments
  for each row execute function public.posts_delete_audit();

/* ========================================================================== */
/* RLS + grants — written together, §6v                                       */
/* ========================================================================== */

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows enable row level security;
alter table public.promoted_placements enable row level security;
alter table public.posts force row level security;
alter table public.post_comments force row level security;
alter table public.follows force row level security;
alter table public.promoted_placements force row level security;

/* ---- posts --------------------------------------------------------------- */

-- The feed is signed-in-only and chronological. An expired story exists only
-- for its author and for staff; everyone else's policy stops at the expiry.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_staff()
    or expires_at is null
    or expires_at > now()
  );

-- You post as yourself, always. Speaking for a company needs ACTIVE
-- membership now; posting as a guide needs actually being one.
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (author_kind <> 'company' or public.is_company_member(company_id))
    and (author_kind <> 'guide' or exists (
      select 1 from public.guide_profiles g where g.id = auth.uid()
    ))
  );

-- Delete: your own words, a company admin over their company's posts, or
-- staff (moderation). Every path leaves the audit trace above.
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete to authenticated
  using (
    author_id = auth.uid()
    or (company_id is not null and public.is_company_admin(company_id))
    or public.is_staff()
  );

/* ---- comments ------------------------------------------------------------ */

-- Readable wherever the post is readable (subquery rides posts' own policy
-- because it runs as the caller — INVOKER semantics inside RLS).
drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

-- Comment as yourself, on a post you can see, not past a block, and not on a
-- story that has already ended.
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and (p.expires_at is null or p.expires_at > now())
        and not public.blocked_between(p.author_id)
    )
  );

drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_staff());

/* ---- follows ------------------------------------------------------------- */

-- Your own follow list is yours; who follows YOU is visible to you; staff see
-- the graph. Counts come from counting, with these same rows.
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = auth.uid()
    or followed_profile_id = auth.uid()
    or (followed_company_id is not null and public.is_company_member(followed_company_id))
    or public.is_staff()
  );

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and (followed_profile_id is null or not public.blocked_between(followed_profile_id))
  );

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = auth.uid());

/* ---- promoted placements ------------------------------------------------- */

-- Everyone signed in may read ACTIVE promotions inside their dates — that is
-- what renders in the feed, labelled by construction. A company sees all of
-- its own rows whatever their state; staff see everything.
drop policy if exists promoted_select on public.promoted_placements;
create policy promoted_select on public.promoted_placements
  for select to authenticated
  using (
    (status = 'active' and current_date between starts_on and ends_on)
    or public.is_company_member(company_id)
    or public.is_staff()
  );

-- Writing is the desk's (CR-17 promotion builder) and the company admin's —
-- a company may draft and manage its own campaigns; the desk can manage all.
drop policy if exists promoted_write on public.promoted_placements;
create policy promoted_write on public.promoted_placements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (public.is_staff() or public.is_company_admin(company_id))
  );

drop policy if exists promoted_update on public.promoted_placements;
create policy promoted_update on public.promoted_placements
  for update to authenticated
  using (public.is_staff() or public.is_company_admin(company_id))
  with check (public.is_staff() or public.is_company_admin(company_id));

drop policy if exists promoted_delete on public.promoted_placements;
create policy promoted_delete on public.promoted_placements
  for delete to authenticated
  using (public.is_staff() or public.is_company_admin(company_id));

/* ---- grants (a policy permits; a grant makes the privilege exist) -------- */

revoke all on public.posts from anon, authenticated;
revoke all on public.post_comments from anon, authenticated;
revoke all on public.follows from anon, authenticated;
revoke all on public.promoted_placements from anon, authenticated;

-- NOTE the absences: no UPDATE grant on posts or comments for anyone — a
-- published word is stood behind or deleted, never silently edited. Nothing
-- at all for anon: the feed is a signed-in surface.
grant select, insert, delete on public.posts to authenticated;
grant select, insert, delete on public.post_comments to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, update, delete on public.promoted_placements to authenticated;

/* ========================================================================== */
/* Realtime                                                                   */
/* ========================================================================== */

do $$
begin
  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.post_comments;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end;
$$;
