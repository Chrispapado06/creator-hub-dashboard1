/* ==========================================================================
 * Summit logs — a climb somebody publishes, so other people can see it.
 *
 * The owner asked for this on 2026-09-02 after their profile mockup drew a card
 * reading "SUMMIT LOG · Aiguille du Tour · 3,542 m", and it turned out nothing
 * behind it existed. Worth writing down, because the gap was invisible from the
 * drawing: `public.posts` is author, body, one photo, a timestamp. No peak, no
 * elevation, no ascent date, no kind — `src/social/types.ts` already said so in
 * capitals ("A POST HAS NO KIND"). And the athlete's own summit list and
 * passport are localStorage, so they had never left the phone. The profile
 * could not show a summit count because ICEFALL had never been told one.
 *
 * ── SELF-REPORTED, AND SAID SO EVERYWHERE ──────────────────────────────────
 * There is deliberately NO `verified` column on this table, and adding one would
 * be a mistake rather than an improvement. The app already defines the word:
 *
 *   "Verified means the summit was reached during an activity recorded in
 *    ICEFALL, and the track reached the summit. It is not a check on the person."
 *
 * Nothing can satisfy that today — recorded activities live on the device and no
 * track has ever reached a server, so there is no evidence here to check against.
 * A boolean nobody can earn is the `verified: false` literal that
 * `network/types.ts` already carries with the note "MUST RENDER AS NOTHING — a
 * tick implies ICEFALL checked somebody, and ICEFALL has checked nobody".
 * The day tracks are uploaded, verification becomes a JOIN against them and gets
 * its own migration. Until then every surface repeats what the owner's own
 * mockup footer already says: "ICEFALL does not verify achievements."
 *
 * WHY IT IS A SEPARATE TABLE AND NOT COLUMNS ON `posts`.
 * A post is words and a picture. A summit log is a CLAIM with a shape — a peak,
 * a height, a date — and it wants constraints a post must not have (a height
 * that fits on Earth, a date that is not in the future). Putting them on `posts`
 * would mean every ordinary post carrying five null columns and a check
 * constraint about mountains. One-to-one against the post it is published as,
 * so the feed can render the card and the profile can count the climbs, from the
 * same row.
 * ========================================================================== */

create table if not exists public.summit_logs (
  id uuid primary key default gen_random_uuid(),

  /*
   * The post this was published as. UNIQUE — one log per post, so a card can
   * never render two claims. CASCADE: deleting the post deletes the claim,
   * because a summit log with no post is a claim nobody can read or report.
   */
  post_id uuid not null unique references public.posts (id) on delete cascade,

  /* Denormalised from the post so a profile can count somebody's climbs without
     joining every post they ever wrote. The trigger below keeps it honest. */
  author_id uuid not null references public.profiles (id) on delete cascade,

  /*
   * THE PEAK, TWICE, AND BOTH ARE NEEDED.
   * `destination_id` when it is a mountain ICEFALL holds, so a profile can link
   * to it and two people's Mont Blanc are the same Mont Blanc. `peak_name` is
   * always set, because the catalogue is 22 countries and somebody will climb
   * something that is not in it — and a summit you cannot record because the
   * app has not heard of your mountain is a worse product than a typed name.
   */
  destination_id text references public.destinations (id) on delete set null,
  peak_name text not null check (length(trim(peak_name)) between 1 and 120),

  /*
   * Nullable. Not every summit has a height the climber knows, and a required
   * field would produce guessed numbers — which is the failure this whole app
   * is arranged against. 0-9000 matches `destinations.elevation_m`; anything
   * above Everest is a typo, and a typo in a public claim is worth refusing.
   */
  elevation_m integer check (elevation_m is null or elevation_m between 0 and 9000),

  /* A date, not a timestamp: what is remembered is the day. */
  summited_on date not null,

  route text check (route is null or length(trim(route)) <= 200),
  /* What the mountain was like — the part other climbers actually use. */
  conditions text check (conditions is null or length(trim(conditions)) <= 1000),

  created_at timestamptz not null default now(),

  /* A summit in the future is not a summit, it is a plan. Checked here rather
     than in the composer because a plan published as an ascent is the kind of
     claim somebody else could act on. */
  constraint summit_not_in_the_future check (summited_on <= (now() at time zone 'utc')::date)
);

create index if not exists summit_logs_author_idx
  on public.summit_logs (author_id, summited_on desc);
create index if not exists summit_logs_destination_idx
  on public.summit_logs (destination_id)
  where destination_id is not null;

comment on table public.summit_logs is
  'A climb somebody published. SELF-REPORTED — there is no verified column and no '
  'way to earn one, because verification means a recorded track reached the summit '
  'and no track has ever reached a server. Every surface must say so.';

/* -------------------------------------------------------------------------- */
/* The author cannot be somebody else                                         */
/* -------------------------------------------------------------------------- */

/*
 * `author_id` is denormalised for counting, which means it can DISAGREE with the
 * post it belongs to — and a summit log filed under one person for a post
 * written by another is a climb attributed to the wrong climber. The insert
 * policy pins it to auth.uid(), but a policy only guards the API: this trigger
 * guards every path, including anything a later migration adds.
 */
create or replace function public.summit_log_author_matches_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_post_author uuid;
begin
  select p.author_id into v_post_author from public.posts p where p.id = new.post_id;
  if v_post_author is null then
    raise exception 'no such post';
  end if;
  if v_post_author is distinct from new.author_id then
    raise exception 'a summit log belongs to the person who wrote the post';
  end if;
  return new;
end;
$$;

drop trigger if exists summit_log_author_matches_post on public.summit_logs;
create trigger summit_log_author_matches_post
  before insert or update on public.summit_logs
  for each row execute function public.summit_log_author_matches_post();

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.summit_logs enable row level security;

/*
 * READABLE WHEREVER ITS POST IS. Not `using (true)`: a summit log published as a
 * STORY must disappear when the story does, and one on a deleted post must go
 * with it. Deferring to `posts` means the claim inherits every rule the post
 * already has — expiry, blocks, highlights — and cannot drift from them.
 */
drop policy if exists summit_logs_select on public.summit_logs;
create policy summit_logs_select on public.summit_logs
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists summit_logs_insert on public.summit_logs;
create policy summit_logs_insert on public.summit_logs
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = (select auth.uid())
    )
  );

/*
 * NO UPDATE POLICY, matching `posts`, `channel_messages` and `group_messages`.
 * A published claim about a mountain is stood behind or deleted. Silently
 * editing "3,542 m" to "4,542 m" under the replies, after people have read it
 * and perhaps planned around it, is exactly what that rule exists to prevent.
 */
drop policy if exists summit_logs_delete on public.summit_logs;
create policy summit_logs_delete on public.summit_logs
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_staff());

revoke all on public.summit_logs from anon, authenticated;
grant select, insert, delete on public.summit_logs to authenticated;

/* -------------------------------------------------------------------------- */
/* What a profile can now say                                                 */
/* -------------------------------------------------------------------------- */

/*
 * DEFINER aggregates, so a profile can show a count and a highest without the
 * reader running a query over somebody else's climbs. The same shape as
 * `follower_count`: the NUMBER is public, and it can never be turned into a
 * list the policy above would not have given anyway.
 *
 * These return the count of PUBLISHED logs. A private diary is not counted
 * because ICEFALL has not been told about it — which is the honest meaning of
 * the figure, and the reason the profile must label it "published", never
 * "climbed".
 */
create or replace function public.summit_count_of(u uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.summit_logs s where s.author_id = u;
$$;

create or replace function public.highest_summit_of(u uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(s.elevation_m) from public.summit_logs s where s.author_id = u;
$$;

revoke all on function public.summit_count_of(uuid) from public, anon;
revoke all on function public.highest_summit_of(uuid) from public, anon;
grant execute on function public.summit_count_of(uuid) to authenticated;
grant execute on function public.highest_summit_of(uuid) to authenticated;

create or replace function public.summit_count(p public.profiles)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.summit_count_of(p.id);
$$;

create or replace function public.highest_summit_m(p public.profiles)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.highest_summit_of(p.id);
$$;

revoke all on function public.summit_count(public.profiles) from public, anon;
revoke all on function public.highest_summit_m(public.profiles) from public, anon;
grant execute on function public.summit_count(public.profiles) to authenticated;
grant execute on function public.highest_summit_m(public.profiles) to authenticated;

comment on function public.summit_count(public.profiles) is
  'How many summit logs this person has PUBLISHED. Not how many mountains they have '
  'climbed — ICEFALL cannot know that, and a surface showing this must say "published". '
  'count(*) over no rows is 0, a measured zero; highest_summit_m returns NULL when '
  'nothing is published, which is NOT MEASURED and renders an em dash.';
