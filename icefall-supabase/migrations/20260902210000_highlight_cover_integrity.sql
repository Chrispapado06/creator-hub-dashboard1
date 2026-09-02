-- ICEFALL — a highlight's cover must be a story the highlight actually contains.
--
-- SELF-REPORTED by the session that wrote 20260902170000, which is applied, so
-- the fix arrives as a new file rather than an edit to history.
--
-- THE DEFECT. `highlights.cover_post_id` carries this comment:
--   "A highlight's cover is one of its own stories ... a cover cannot show
--    something the highlight does not contain."
-- The policies never enforced it. `highlights_update` constrains WHO owns the
-- row (`owner_id = auth.uid()`) and says nothing about WHICH post the cover
-- points at, so an owner could set their own highlight's cover to ANY post uuid
-- — including a stranger's expired story. A comment claiming a guarantee that
-- was never built is worse than no comment: it tells the next reader the rule
-- holds.
--
-- WHY IT IS NOT (TODAY) A LEAK, AND WHY IT IS STILL WORTH CLOSING NOW. The
-- amended `posts_select` tests membership of `highlight_items`, not
-- `cover_post_id`, so a stranger's post set as a cover stays unreadable and a
-- client fetching it gets nothing — a dangling reference, not an exposure. It
-- stops being harmless the moment anything downstream trusts the cover, which
-- is exactly what a cover is for. Fix the invariant while it is still cheap.
--
-- BOTH POLICIES ARE RESTATED WHOLE. A policy has no ALTER for its predicate,
-- and rewriting one from a description is how an arm goes missing — the failure
-- mode this project has now hit twice. The `owner_id = auth.uid()` arms below
-- are the live ones, verbatim.

/* ---- The integrity rule, in one place ----------------------------------- */

/*
 * A cover is null, or it is a post that is IN this highlight. Ownership comes
 * free: `highlight_items_insert` already requires the caller to own both the
 * highlight and the post, so a cover drawn from the items can only ever be the
 * owner's own story.
 *
 * ON INSERT this evaluates against a highlight that has no items yet, so a new
 * highlight must be created with a NULL cover and given one after its first
 * story is added. That is the honest order of events — a cover for an empty
 * highlight would be a picture of nothing — and the client should follow it.
 */

drop policy if exists highlights_write on public.highlights;
create policy highlights_write on public.highlights
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      cover_post_id is null
      or exists (
        select 1 from public.highlight_items hi
         where hi.highlight_id = highlights.id
           and hi.post_id = highlights.cover_post_id
      )
    )
  );

drop policy if exists highlights_update on public.highlights;
create policy highlights_update on public.highlights
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      cover_post_id is null
      or exists (
        select 1 from public.highlight_items hi
         where hi.highlight_id = highlights.id
           and hi.post_id = highlights.cover_post_id
      )
    )
  );

/* ---- The half a write-time check cannot reach --------------------------- */

/*
 * REMOVING A STORY FROM A HIGHLIGHT was the other way to break the same rule,
 * and no WITH CHECK can see it: the write happens on `highlight_items`, not on
 * `highlights`, so the cover is left pointing at a story the highlight no
 * longer contains. The column's own `on delete set null` covers the post being
 * DELETED and not the item being REMOVED — two different events, one of which
 * was handled.
 *
 * SECURITY DEFINER so the clean-up cannot itself be refused by the row policy
 * on `highlights`; it touches exactly one row, sets exactly one column to null,
 * and takes no user input.
 */
create or replace function public.highlights_clear_orphaned_cover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.highlights
     set cover_post_id = null
   where id = old.highlight_id
     and cover_post_id = old.post_id;
  return old;
end;
$$;

drop trigger if exists highlight_items_clear_cover on public.highlight_items;
create trigger highlight_items_clear_cover
  after delete on public.highlight_items
  for each row execute function public.highlights_clear_orphaned_cover();

revoke all on function public.highlights_clear_orphaned_cover() from public, anon;
