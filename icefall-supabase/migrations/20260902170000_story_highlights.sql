/* ==========================================================================
 * Story highlights — a story kept past its day, on the author's profile.
 *
 * A story is a post with `expires_at` set. Expiry here is not a delete and
 * never was: 20260831190000 leaves the row in place and drops it out of
 * everyone ELSE's read policy at that instant, which is why no cleanup job
 * exists. The author can always still see their own.
 *
 * THAT IS THE WHOLE REASON THIS MIGRATION HAS TO TOUCH `posts_select`.
 * Highlighting a story does not need the row resurrecting — it is still there.
 * It needs the row to become VISIBLE TO OTHER PEOPLE AGAIN, permanently, which
 * is exactly what expiry took away. Adding the tables without amending the read
 * policy would produce highlights that look right to their owner and are empty
 * for every visitor, and it would look like a UI bug for as long as it took
 * somebody to test the feature while signed in as someone else.
 *
 * YOU MAY ONLY HIGHLIGHT YOUR OWN STORY. Enforced in the insert policy, not
 * merely in the client: otherwise anyone could pin somebody else's expired
 * story back into public view, which is precisely the expectation the 24 hours
 * created.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* highlights                                                                 */
/* -------------------------------------------------------------------------- */

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- "Everest". Trimmed and bounded so a highlight cannot be a paragraph.
  name text not null check (length(trim(name)) between 1 and 40),
  /* The circle shown on the profile. A highlight's cover is one of its own
     stories, so there is no second image to store, no second thing to moderate,
     and a cover cannot show something the highlight does not contain. Nulled
     rather than cascaded when that story goes, so losing the cover never takes
     the highlight with it. */
  cover_post_id uuid references public.posts (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  -- One "Everest" per person: a second one is a rename, not a new highlight.
  constraint highlights_name_unique unique (owner_id, name)
);

create index if not exists highlights_owner_idx
  on public.highlights (owner_id, position, created_at);

comment on table public.highlights is
  'A named, permanent collection of the owner''s own stories, shown on their profile. Membership makes an expired story publicly readable again — see the posts_select amendment in this migration.';

/* -------------------------------------------------------------------------- */
/* highlight_items                                                            */
/* -------------------------------------------------------------------------- */

create table if not exists public.highlight_items (
  highlight_id uuid not null references public.highlights (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (highlight_id, post_id)
);

create index if not exists highlight_items_post_idx
  on public.highlight_items (post_id);
create index if not exists highlight_items_order_idx
  on public.highlight_items (highlight_id, position, added_at);

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.highlights enable row level security;
alter table public.highlight_items enable row level security;

-- Highlights sit on a profile and are meant to be seen.
drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights
  for select to authenticated
  using (true);

drop policy if exists highlights_write on public.highlights;
create policy highlights_write on public.highlights
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists highlights_update on public.highlights;
create policy highlights_update on public.highlights
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists highlights_delete on public.highlights;
create policy highlights_delete on public.highlights
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists highlight_items_select on public.highlight_items;
create policy highlight_items_select on public.highlight_items
  for select to authenticated
  using (true);

/* The post must be YOURS and the highlight must be YOURS. Both halves are
   required: owning the highlight alone would let anyone pin a stranger's
   expired story back into public view, and owning the post alone would let
   anyone add to a stranger's highlight. */
drop policy if exists highlight_items_insert on public.highlight_items;
create policy highlight_items_insert on public.highlight_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.highlights h
       where h.id = highlight_id and h.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists highlight_items_delete on public.highlight_items;
create policy highlight_items_delete on public.highlight_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.highlights h
       where h.id = highlight_id and h.owner_id = auth.uid()
    )
  );

/* -------------------------------------------------------------------------- */
/* Table privileges                                                           */
/* -------------------------------------------------------------------------- */

/*
 * RLS decides WHICH ROWS; a grant decides whether the role may touch the table
 * at all, and without one every policy above is unreachable. This bit is not
 * optional here for a second reason: `posts_select` below reads
 * `highlight_items`, and a policy predicate runs as the CALLING user, so a
 * reader with no privilege on that table gets "permission denied for table
 * highlight_items" while merely listing posts. That is exactly what eight
 * SOCIAL tests reported before these four lines existed.
 *
 * Revoked from `anon, authenticated` by name, not from `public`: default
 * privileges grant `public`, so revoking only from it leaves anon holding
 * access. That trap is written up in the constitution and has bitten before.
 */
revoke all on public.highlights from anon, authenticated;
revoke all on public.highlight_items from anon, authenticated;

grant select, insert, update, delete on public.highlights to authenticated;
-- No UPDATE on items: a highlight's contents are added and removed, never
-- edited in place, which keeps `position` reorders honest inserts/deletes.
grant select, insert, delete on public.highlight_items to authenticated;

/* -------------------------------------------------------------------------- */
/* The amendment that makes any of it visible                                 */
/* -------------------------------------------------------------------------- */

/*
 * Re-stated in full rather than patched, because a policy is replaced whole and
 * a reader of this file should be able to see the entire rule without opening
 * 20260831190000. The only new clause is the last one.
 *
 * `exists`, not a join: a post in two highlights must not return twice, and a
 * USING clause is a predicate rather than a row source.
 */
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_staff()
    or expires_at is null
    or expires_at > now()
    -- A story kept as a highlight is public again, for as long as it is kept.
    -- Removing it from every highlight returns it to expired, which is the
    -- behaviour someone deleting a highlight expects.
    or exists (
      select 1 from public.highlight_items hi
       where hi.post_id = posts.id
    )
  );

comment on column public.posts.expires_at is
  'Set = a story: it leaves everyone else''s read policy at this moment, no job '
  'needed. The author and staff can still see it — your own history is yours. '
  'A story added to a highlight becomes publicly readable again while it stays '
  'in one; see 20260902170000.';
