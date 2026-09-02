/* ==========================================================================
 * Follower counts on a public profile — the COUNT, never the LIST.
 *
 * The owner's profile mockup (2026-09-02) shows "1.2K Followers · 183
 * Following" on a profile a stranger can open. Today that is unreadable:
 * `follows_select` is
 *     follower_id = auth.uid() or followed_profile_id = auth.uid()
 * so you can only see follows that involve YOU. Correct, and it makes counting
 * somebody else's followers impossible — which is why the number is not there.
 *
 * THE SAME SHAPE AS CHANNEL VIEW COUNTS, FOR THE SAME REASON.
 * `channel_message_stats` exposes how many people opened a message and never
 * who. This does the same for follows: a profile says how many follow it,
 * and NOBODY gains the ability to enumerate them. Those are different
 * disclosures and only one of them is what a follower count is for.
 *
 * Why that distinction is worth a migration rather than a client-side count:
 * a follower LIST on a mountaineering app is a list of who a person climbs
 * with, which is exactly the kind of thing this app refuses to publish
 * elsewhere (see `group_members_select`, members-only by policy, and
 * `DISCOVERABLE_ATHLETES` which stays empty on purpose). Relaxing
 * `follows_select` to make the number work would have handed over the graph to
 * get an integer.
 * ========================================================================== */

/*
 * SECURITY DEFINER, so it can count rows the caller cannot read. That is the
 * entire point — the function is the boundary between "183 people" and "these
 * 183 people".
 *
 * uuid argument rather than a whole `profiles` row: `identity_verified(p
 * public.profiles)` takes a composite and it cost this project two failed
 * pushes today, because the type would not resolve from inside a policy created
 * by a `do $$` block. A uuid has nothing to resolve. Computed fields for
 * PostgREST are declared separately below, where the composite IS required.
 */
create or replace function public.follower_count_of(u uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.follows f where f.followed_profile_id = u;
$$;

create or replace function public.following_count_of(u uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.follows f where f.follower_id = u;
$$;

revoke all on function public.follower_count_of(uuid) from public, anon;
revoke all on function public.following_count_of(uuid) from public, anon;
grant execute on function public.follower_count_of(uuid) to authenticated;
grant execute on function public.following_count_of(uuid) to authenticated;

/*
 * The PostgREST computed fields, so a profile arrives WITH its counts in one
 * request: `profiles?select=id,display_name,follower_count,following_count`.
 * Each delegates to the uuid function, so there is exactly one definition of
 * what a follower is and these cannot drift from it.
 */
create or replace function public.follower_count(p public.profiles)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.follower_count_of(p.id);
$$;

create or replace function public.following_count(p public.profiles)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.following_count_of(p.id);
$$;

revoke all on function public.follower_count(public.profiles) from public, anon;
revoke all on function public.following_count(public.profiles) from public, anon;
grant execute on function public.follower_count(public.profiles) to authenticated;
grant execute on function public.following_count(public.profiles) to authenticated;

comment on function public.follower_count(public.profiles) is
  'How many follow this profile. An AGGREGATE — `follows_select` still refuses the '
  'rows, so a count can never be turned back into a list of who. A follower list on '
  'a mountaineering app is a list of who somebody climbs with.';

/*
 * A COUNT OF ZERO IS A MEASURED ZERO and renders "0", never blank and never an
 * em dash. `count(*)` over no rows returns 0, not NULL, so nothing here can
 * produce the "not measured" case by accident — which matters, because this app
 * reserves the em dash strictly for "we do not know" and a follower count that
 * rendered one would be claiming ignorance of something it just measured.
 */
