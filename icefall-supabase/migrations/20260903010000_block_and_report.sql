/* ==========================================================================
 * ICEFALL — blocking stops being decoration, and a report can say what it is
 * about.
 *
 * Two safety features existed on paper and neither worked. This file was
 * written against the LIVE database (queried, not remembered), so the
 * before-state below is what is actually there today, not what the migration
 * history implies.
 *
 * ── WHAT WAS BROKEN, EXACTLY ───────────────────────────────────────────────
 *
 * 1. EVERY POST REPORT HAS FAILED. `icefall-app/src/components/social/
 *    ReportDialog.tsx` inserts `{ reporter_id, post_id, reason, detail }`.
 *    Live `reports` has no `post_id` column: id, reporter_id, subject_id,
 *    thread_id, reason, detail, created_at, status. So the insert has always
 *    raised, and the app's catch branch has always told the reporter the
 *    report was "kept on this device and has not reached moderation".
 *    That message is honest — which is why nobody noticed — but no post
 *    report has ever arrived. `reports` currently holds 0 rows.
 *
 *    NOTE FOR WHOEVER READS THE HISTORY. 20260831190000_social.sql contains
 *    an `alter table public.reports add column post_id`, and that migration
 *    is marked applied. The column is not there. The section was appended to
 *    the file after it ran, so it never executed anywhere. The column is
 *    added here, `if not exists`, so both stories end the same way.
 *
 * 2. BLOCKING WAS A TABLE NOBODY WROTE TO AND NO READ CONSULTED. `blocks`
 *    exists with a correct policy, `blocked_between()` exists and is checked
 *    on the three WRITE paths (comment, like, follow) and on messages — but
 *    no SELECT policy anywhere mentioned it. Even after a block the blocked
 *    person stayed fully visible: their posts, their comments, their profile,
 *    their name in search. A block button on top of that is a lie told by the
 *    UI, so the button waits on this file rather than the other way round.
 *
 * ── THE RULE THIS FILE INSTALLS ────────────────────────────────────────────
 *
 * A BLOCK IS SYMMETRIC AND IT IS A DISAPPEARANCE. If A blocks B then A does
 * not see B and B does not see A: posts, stories, comments, likes, follows,
 * highlights, the roster and the conversation of any group they share, and
 * each other's profile — which is what search reads. A one-way block is a
 * mute with extra steps and leaves the harassed person exactly as exposed as
 * before. Staff (`is_staff()`) are exempt everywhere, or moderation goes
 * blind at the moment it is needed.
 *
 * A BLOCK IS NOT A DELETION. Nothing is destroyed; unblocking restores every
 * row to view. That is why the exclusions below are policy arms and not
 * cascades.
 *
 * ── WHAT THIS FILE DOES NOT TOUCH, AND WHY ─────────────────────────────────
 *
 * `posts` still has no UPDATE policy and no UPDATE grant, deliberately
 * (20260831190000): a published word is stood behind or deleted, never
 * silently edited under the replies to it. Nothing here adds one, and
 * `reports` gains an update guard rather than a way to rewrite an accusation.
 * ========================================================================== */

/* ==========================================================================
 * PART 1 — A report can name what it is about
 * ========================================================================== */

/*
 * WHAT PEOPLE CAN ACTUALLY REPORT, checked against the schema rather than
 * guessed: a post (which is also a story — a story is a post with an expiry,
 * not a second table), a comment, a message in a group, a message in a
 * company channel, one direct message, the conversation it sat in
 * (`thread_id`, already here), and a person (`subject_id`, already here).
 *
 * SUMMIT LOGS ARE NOT IN THAT LIST, ON PURPOSE. `summit_logs.post_id` is
 * NOT NULL UNIQUE and cascades from the post, so a summit log IS a post from
 * the reporting side. A `summit_log_id` column would be a second way to name
 * one object, and two ways to name one object is how two reports about the
 * same claim end up disagreeing about what was reported.
 *
 * ON DELETE — THE DECISION THE WHOLE QUEUE TURNS ON.
 *
 * SET NULL, never CASCADE. A report whose evidence vanishes the moment the
 * offender deletes the post is how a repeat offender stays invisible: three
 * reports, three deletions, and moderation is looking at an empty queue and a
 * clean account. With SET NULL the report survives the deletion — and it
 * survives it NAMING SOMEBODY, because the trigger below stamps `subject_id`
 * (the author of what was reported) and `subject_kind` (what sort of thing it
 * was) at insert time. "Four open harassment reports about this person, all
 * about posts that no longer exist" is a sentence the queue can now say.
 *
 * THE CONTENT ITSELF ALSO SURVIVES, in `audit_events`: deleting a post, a
 * comment, a group message, a channel message or a summit log writes the
 * whole deleted row into that staff-only table (the triggers in
 * 20260831190000 and in Part 4 below). So the queue keeps the accusation, and
 * the audit keeps the words. Neither claims to keep more than it does.
 */

alter table public.reports
  add column if not exists post_id uuid references public.posts (id) on delete set null;
alter table public.reports
  add column if not exists comment_id uuid references public.post_comments (id) on delete set null;
alter table public.reports
  add column if not exists group_message_id uuid references public.group_messages (id) on delete set null;
alter table public.reports
  add column if not exists channel_message_id uuid references public.channel_messages (id) on delete set null;
alter table public.reports
  add column if not exists message_id uuid references public.messages (id) on delete set null;

/*
 * WHAT WAS REPORTED, in a word, and it never goes null.
 *
 * Stamped by the trigger below from whichever reference was supplied, and
 * frozen by the update guard. It exists because of a trap worth spelling out:
 *
 *   the obvious constraint — `check (at least one of the reference columns is
 *   not null)` — makes DELETING A REPORTED POST IMPOSSIBLE. The foreign key's
 *   SET NULL is an UPDATE, an UPDATE re-checks CHECK constraints, and a report
 *   that named only that post would fail the check. The delete then fails.
 *   The same trap, worse: a reported person could no longer delete their own
 *   account, because `subject_id` going null would break the same constraint.
 *   A moderation feature that prevents moderation, and a privacy right broken
 *   by a safety feature.
 *
 * So the "names at least one subject" rule lives on a column that no cascade
 * can ever clear, and the trigger refuses the empty report at the door.
 */
alter table public.reports
  add column if not exists subject_kind text;

/* Existing rows first — there are none in production (checked: 0), but a
   migration that only works on an empty table is a migration that fails on
   somebody's dev copy. A row that names nothing at all stays NULL and the
   constraint below refuses to install: that is the correct loud failure, not
   something to paper over with a default. */
update public.reports
   set subject_kind = case
     when thread_id is not null then 'thread'
     when subject_id is not null then 'profile'
     else null
   end
 where subject_kind is null;

/**
 * The door: a report must name something, and the SERVER decides who it is
 * about.
 *
 * `subject_id` is resolved from the reported content's author, overwriting
 * whatever the client sent. A client cannot point a report at somebody who
 * did not write the thing — which matters, because `subject_id` is what makes
 * a repeat offender countable, and a count you can aim at an innocent person
 * is a weapon rather than a queue.
 *
 * SECURITY DEFINER because the reporter may no longer be able to read what
 * they are reporting (a story that expired between seeing it and reporting
 * it, the on-device queue draining hours later in a hut with signal).
 *
 * WHAT THAT COSTS, stated rather than hidden: somebody holding the UUID of a
 * post or message they cannot read could file a report about it and then read
 * their own report row to learn who wrote it. It buys an author id, for
 * content whose id they must already have obtained — which requires having
 * seen it. Judged acceptable against the alternative, which is refusing every
 * report of an expired story. If that trade ever stops being acceptable, the
 * fix is a visibility test in `reports_insert_own`, not a change here.
 */
create or replace function public.reports_name_the_subject()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_author uuid;
begin
  -- Most specific first: a report about one message is about that message,
  -- even when the conversation it sits in is named too.
  if new.message_id is not null then
    new.subject_kind := 'message';
    select m.sender_id into v_author from public.messages m where m.id = new.message_id;
  elsif new.group_message_id is not null then
    new.subject_kind := 'group_message';
    select g.author_id into v_author from public.group_messages g where g.id = new.group_message_id;
  elsif new.channel_message_id is not null then
    new.subject_kind := 'channel_message';
    select c.author_id into v_author from public.channel_messages c where c.id = new.channel_message_id;
  elsif new.comment_id is not null then
    new.subject_kind := 'comment';
    select pc.author_id into v_author from public.post_comments pc where pc.id = new.comment_id;
  elsif new.post_id is not null then
    -- Stories and summit logs arrive here: both are posts.
    new.subject_kind := 'post';
    select p.author_id into v_author from public.posts p where p.id = new.post_id;
  elsif new.thread_id is not null then
    new.subject_kind := 'thread';
  elsif new.subject_id is not null then
    new.subject_kind := 'profile';
  else
    raise exception
      'a report must name what it is about — a post, a comment, a message, a conversation or a person';
  end if;

  if v_author is not null then
    new.subject_id := v_author;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_name_the_subject on public.reports;
create trigger reports_name_the_subject
  before insert on public.reports
  for each row execute function public.reports_name_the_subject();

alter table public.reports drop constraint if exists reports_names_a_subject;
alter table public.reports
  add constraint reports_names_a_subject check (
    subject_kind is not null
    and subject_kind in
      ('profile', 'thread', 'post', 'comment', 'group_message', 'channel_message', 'message')
  );

comment on column public.reports.subject_kind is
  'What was reported, stamped by the server at insert and frozen afterwards. It '
  'outlives the thing itself: the reference columns go NULL when the content is '
  'deleted, this does not, so a queue can still say what the report was about.';
comment on column public.reports.post_id is
  'The reported post — a story is a post, and a summit log is a post, so both '
  'arrive here. SET NULL: deleting the post must not delete the report, or '
  'deleting your posts becomes a way to clear your record.';

/* FK indexes, NOT partial. 20260829200000 added an index for every foreign key
   because an unindexed one turns a parent delete into a sequential scan, and
   20260902100000 recorded why the partial version is the wrong tool: it reads
   as coverage in review and is not reliably usable for the scan Postgres runs
   when the parent row goes. These five are the scan that runs every time a
   post, comment or message is deleted — i.e. every moderation action. */
drop index if exists public.reports_post_idx;
create index reports_post_idx on public.reports (post_id);
create index if not exists reports_comment_idx on public.reports (comment_id);
create index if not exists reports_group_message_idx on public.reports (group_message_id);
create index if not exists reports_channel_message_idx on public.reports (channel_message_id);
create index if not exists reports_message_idx on public.reports (message_id);

/* ==========================================================================
 * PART 2 — Staff can resolve a report, and the resolution leaves a trace
 * ========================================================================== */

/*
 * Today `reports_admin_update` lets an admin change the row and that is the
 * entire record: no who, no when, no what was decided, and nothing stopping
 * an update from rewriting the accusation itself.
 */

alter table public.reports
  add column if not exists handled_by uuid references public.profiles (id) on delete set null;
alter table public.reports
  add column if not exists handled_at timestamptz;
alter table public.reports
  add column if not exists resolution text;

alter table public.reports drop constraint if exists reports_resolution_length;
alter table public.reports
  add constraint reports_resolution_length check (
    resolution is null or length(trim(resolution)) between 1 and 2000
  );

comment on column public.reports.resolution is
  'What the desk decided, in the desk''s own words. Deliberately free text and '
  'NOT an outcome enum: ICEFALL has resolved no reports yet, so there is no '
  'vocabulary of outcomes to draw from, and inventing one now would put words in '
  'the queue''s mouth before it has said anything.';

/**
 * The accusation is a record of what somebody said happened. Handling it may
 * change; it may not.
 *
 * THE ONE SUBTLETY THAT MAKES THIS FILE WORK. This trigger fires on the
 * foreign-key SET NULL updates too — when a reported post is deleted, the
 * database itself updates `post_id` to NULL on every report naming it. So
 * clearing a reference is permitted (that is a deletion happening upstream)
 * while setting or re-pointing one is not. Without that distinction, adding
 * this guard would have made every reported post undeletable.
 */
create or replace function public.reports_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.reporter_id is distinct from old.reporter_id
     or new.reason is distinct from old.reason
     or new.detail is distinct from old.detail
     or new.created_at is distinct from old.created_at
     or new.subject_kind is distinct from old.subject_kind then
    raise exception
      'a report is the record of what somebody said happened — only its handling may change';
  end if;

  -- References may be CLEARED (the content was deleted) but never aimed
  -- somewhere new: re-pointing a live report at a different person's post is
  -- how a real complaint becomes somebody else's problem.
  if (new.subject_id is distinct from old.subject_id and new.subject_id is not null)
     or (new.thread_id is distinct from old.thread_id and new.thread_id is not null)
     or (new.post_id is distinct from old.post_id and new.post_id is not null)
     or (new.comment_id is distinct from old.comment_id and new.comment_id is not null)
     or (new.group_message_id is distinct from old.group_message_id and new.group_message_id is not null)
     or (new.channel_message_id is distinct from old.channel_message_id and new.channel_message_id is not null)
     or (new.message_id is distinct from old.message_id and new.message_id is not null) then
    raise exception 'a report points where it pointed when it was filed';
  end if;

  -- Who handled it is stamped, not typed: a self-reported handler is not a
  -- record of anything. auth.uid() is NULL for the database's own cascade
  -- updates, and stamping then would erase a real handler with a null.
  if (new.status is distinct from old.status or new.resolution is distinct from old.resolution)
     and auth.uid() is not null then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists reports_guard on public.reports;
create trigger reports_guard
  before update on public.reports
  for each row execute function public.reports_guard();

/**
 * The trace. Same shape as `posts_delete_audit` — a direct DEFINER insert
 * rather than `record_audit_event`, because that helper raises for anybody who
 * is not staff and this trigger must also survive the database's own cascade
 * updates.
 *
 * WHAT IS NOT COPIED IN: the accusation. `previous`/`next` carry the status
 * and the resolution, not the reporter or their words — those are in `reports`
 * already, and copying a reporter's identity into a second table is retention
 * with no reader.
 */
create or replace function public.reports_handled_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     or new.resolution is distinct from old.resolution then
    insert into public.audit_events
      (actor_id, actor_role, action, entity_type, entity_id, previous, next)
    values
      (auth.uid(), coalesce(public.my_role()::text, 'service'),
       'report.handled', 'report', old.id::text,
       jsonb_build_object('status', old.status, 'resolution', old.resolution),
       jsonb_build_object('status', new.status, 'resolution', new.resolution,
                          'handled_by', new.handled_by, 'handled_at', new.handled_at));
  end if;
  return new;
end;
$$;

drop trigger if exists reports_handled_audit on public.reports;
create trigger reports_handled_audit
  after update on public.reports
  for each row execute function public.reports_handled_audit();

/*
 * `reports_select` and `reports_admin_update` are left exactly as they are.
 * They test `is_admin()`, and `is_staff()` is a strict subset of it — staff
 * membership requires `profiles.role = 'admin'` as well as an active
 * `staff_members` row — so every staff member already reads and resolves every
 * report. Narrowing them to `is_staff()` would lock out an admin who has no
 * staff row, which is a live-database question, not a migration's to answer.
 */

/* ==========================================================================
 * PART 3 — Blocking becomes real, on the server
 * ========================================================================== */

/**
 * Everyone the caller is in a block with, in either direction, as a set.
 *
 * ONE HELPER, ONE RULE. Eight policies below ask the same question and a
 * ninth copy of the same EXISTS is how one of them ends up subtly different —
 * and a block that holds on seven surfaces out of eight is not a block.
 *
 * WHY A SET AND NOT A BOOLEAN. `blocked_between(uuid)` already answers the
 * per-row question and the write paths call it; on a read policy it would be
 * called once per candidate row. Written as a set it goes in the policy as an
 * uncorrelated subquery — `x not in (select ...)` — which Postgres runs ONCE
 * per query and then probes in memory. The feed is the hottest read in the
 * app and this is the difference between two index scans per query and two
 * per post.
 *
 * `blocked_between` is then rewritten on top of it so the two cannot drift.
 * Note the deliberate absence of a third name for the same idea: this file
 * could have added `blocked_with()`, and then there would be two helpers to
 * keep in step instead of one.
 *
 * SECURITY DEFINER for the same reason `is_staff()` is: `blocks` has FORCE
 * ROW LEVEL SECURITY and `blocks_own` only ever shows a caller the blocks
 * they created, so an INVOKER version would be blind to the half of the
 * symmetry that matters most — the blocks placed ON the caller. It leaks
 * nothing: it can only ever answer about auth.uid().
 */
create or replace function public.blocked_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.blocked_id from public.blocks b where b.blocker_id = (select auth.uid())
  union
  select b.blocker_id from public.blocks b where b.blocked_id = (select auth.uid())
$$;

revoke all on function public.blocked_ids() from public, anon;
grant execute on function public.blocked_ids() to authenticated;

comment on function public.blocked_ids() is
  'Every profile the caller is in a block with, either direction. The single '
  'definition of "blocked" — every read policy that hides somebody asks this and '
  'nothing else, so they cannot drift apart.';

/* Same answer as before, now expressed once. Callers unchanged:
   post_comments_insert, post_likes_insert, follows_insert. */
create or replace function public.blocked_between(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.blocked_ids() as b (id) where b.id = other);
$$;

/* ---- The index that makes it cheap --------------------------------------- */

/*
 * `blocked_ids()` is two index scans, and only two, per query:
 *
 *   blocker_id = me  → `blocks_pkey` on (blocker_id, blocked_id): index-only.
 *   blocked_id  = me → needs the mirror. `blocks_blocked_idx` was (blocked_id)
 *                      alone, so it found the rows and then went to the heap
 *                      for each blocker_id.
 *
 * Making it (blocked_id, blocker_id) turns the second half index-only too, and
 * because blocked_id stays the leading column it still covers the foreign key
 * — which is the reason the single-column index existed (20260829200000). The
 * old one is therefore redundant, not merely duplicated, and is dropped rather
 * than left to cost a write on every block.
 */
create index if not exists blocks_blocked_blocker_idx on public.blocks (blocked_id, blocker_id);
drop index if exists public.blocks_blocked_idx;

/* ---- posts --------------------------------------------------------------- */

/*
 * BEFORE (live, checked):
 *   (author_id = auth.uid()) OR is_staff() OR (expires_at IS NULL)
 *   OR (expires_at > now())
 *   OR EXISTS (SELECT 1 FROM highlight_items hi WHERE hi.post_id = posts.id)
 *
 * AFTER: all five arms kept, verbatim in meaning, now the left half of an AND
 * whose right half is the block exclusion. Every arm matters — the author arm
 * is how you see your own expired stories, the highlight arm is how a story
 * kept in a highlight stays public (20260902170000) — and dropping one here
 * would hide content silently.
 *
 * `auth.uid()` becomes `(select auth.uid())` — the InitPlan hoisting of
 * 20260829210000, which changes nothing about who sees what and evaluates it
 * once per query instead of once per row.
 *
 * NOW HIDDEN: every post, and therefore every story, by anyone the caller is
 * in a block with — in either direction. Because comments, likes and summit
 * logs all ride this policy through an EXISTS on `posts`, they go with it.
 *
 * A CONSEQUENCE WORTH KNOWING. `author_id` is always the human who pressed
 * send, including on a company post (20260831190000). So blocking the person
 * who runs an operator's account hides that operator's posts from you. That
 * is the right way round — a harasser must not be able to keep speaking at
 * somebody through a company login — but a company cannot itself be blocked,
 * and if the owner ever wants that, it is a different table.
 */
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    (
      author_id = (select auth.uid())
      or public.is_staff()
      or expires_at is null
      or expires_at > now()
      or exists (
        select 1 from public.highlight_items hi
         where hi.post_id = posts.id
      )
    )
    and (
      public.is_staff()
      or author_id not in (select b.id from public.blocked_ids() as b (id))
    )
  );

/* ---- comments ------------------------------------------------------------ */

/*
 * BEFORE: EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id)
 * AFTER:  the same, AND the comment's own author is not blocked.
 *
 * The subquery already hides comments on hidden posts. This hides a blocked
 * person's comment sitting under a post that is still perfectly visible —
 * which, on a feed, is where they would actually be encountered.
 */
drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
    and (
      public.is_staff()
      or author_id not in (select b.id from public.blocked_ids() as b (id))
    )
  );

/* ---- likes --------------------------------------------------------------- */

/*
 * BEFORE: EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id)
 * AFTER:  the same, AND the liker is not blocked.
 *
 * NOW HIDDEN: a blocked person's name in the list of who liked a post.
 *
 * NOT HIDDEN: the number. `like_count()` is SECURITY DEFINER by design
 * (20260902100000) and keeps counting everybody, so a post liked by eleven
 * people still says eleven while the list you can open shows ten. That is the
 * doctrine working, not a bug to fix: the count is a measured fact about the
 * post, the list is who you can see. A count is not a list.
 */
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
    and (
      public.is_staff()
      or profile_id not in (select b.id from public.blocked_ids() as b (id))
    )
  );

/* ---- follows ------------------------------------------------------------- */

/*
 * BEFORE:
 *   (follower_id = auth.uid()) OR (followed_profile_id = auth.uid())
 *   OR ((followed_company_id IS NOT NULL) AND is_company_member(followed_company_id))
 *   OR is_staff()
 *
 * AFTER: all four arms kept; a row disappears if EITHER end of it is somebody
 * the caller is in a block with.
 *
 * NOW HIDDEN: a blocked person in your followers list, and your own follow of
 * them if you followed before blocking. `follows_insert` already refused new
 * follows across a block (20260831190000); this is the half that was missing —
 * the follow that predates the block.
 *
 * The DEFINER counts (`follower_count`, `following_count`, 20260902260000) are
 * untouched and stay whole, for the same reason as likes.
 */
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated
  using (
    (
      follower_id = (select auth.uid())
      or followed_profile_id = (select auth.uid())
      or (followed_company_id is not null and public.is_company_member(followed_company_id))
      or public.is_staff()
    )
    and (
      public.is_staff()
      or (
        follower_id not in (select b.id from public.blocked_ids() as b (id))
        and (
          followed_profile_id is null
          or followed_profile_id not in (select b.id from public.blocked_ids() as b (id))
        )
      )
    )
  );

/* ---- profiles — this is what makes search obey --------------------------- */

/*
 * BEFORE: true.
 * AFTER:  yourself, or staff, or anyone you are not in a block with.
 *
 * NOW HIDDEN: the blocked person's profile — which is search
 * (`icefall-app/src/search/people.ts` runs two ilike filters straight at this
 * table), their profile page, and their name wherever a screen resolves it.
 *
 * THIS IS THE WIDEST CHANGE IN THE FILE and it is the one the feature needs:
 * a block that leaves the harasser findable by name has not removed them from
 * anything. It stays a whitelist of three arms rather than a rewrite, so the
 * only people who lose a row are the ones a block already names.
 *
 * KNOWN CONSEQUENCE, not hidden: if you block somebody you once had a
 * conversation with, their name stops resolving in that conversation for you.
 * Staff and company members read those threads through their own arms, so the
 * desk is unaffected; unblocking brings the name back. If a screen would end
 * up rendering an em dash where a name was, that screen must say "blocked",
 * because an em dash in this app means NOT MEASURED and this is measured.
 */
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_staff()
    or id not in (select b.id from public.blocked_ids() as b (id))
  );

/* ---- highlights ---------------------------------------------------------- */

/*
 * BEFORE: true.
 * AFTER:  staff, or an owner the caller is not in a block with.
 *
 * NOW HIDDEN: a blocked person's highlight rail on their profile. The posts
 * inside were already going through `posts_select` above; this stops the empty
 * rail from being there at all.
 *
 * `highlight_items` is deliberately LEFT AT true, and this is load-bearing:
 * `posts_select` decides whether an expired story is still public by asking
 * whether a highlight item points at it, and that subquery runs as the caller.
 * Narrowing `highlight_items` would silently change which stories the whole
 * platform can see. The items carry no words — a highlight id, a post id, a
 * position — and both ends are gated already.
 */
drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights
  for select to authenticated
  using (
    public.is_staff()
    or owner_id not in (select b.id from public.blocked_ids() as b (id))
  );

/* ---- groups: the roster and the conversation ----------------------------- */

/*
 * group_members BEFORE:
 *   (profile_id = (select auth.uid())) OR is_group_member(group_id)
 * AFTER: the same, plus a staff arm, minus blocked people.
 *
 * NOW HIDDEN: a blocked person's row in the roster of a group you share, so
 * their name is not sitting in the member list of your own expedition group.
 *
 * NOT CHANGED, and stated so nobody "fixes" it later: `member_count()` is
 * DEFINER and keeps counting them, so a group can say six members and list
 * five. Blocking somebody does not un-join them from a mountain — the count is
 * true, and the list is who you can see. The same distinction as likes.
 *
 * NOR IS JOINING GATED. 20260902100000 decided that deliberately: gating
 * membership on a block would let one person lock others out of a peak. This
 * file does not reopen that, and for the same reason `groups_select` is left
 * at `true` — hiding the group itself would hand its founder a veto over who
 * may plan that mountain.
 *
 * The staff arm is new and is needed: without it a moderator cannot open the
 * roster of a group they have been asked to look at.
 */
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (
    (
      profile_id = (select auth.uid())
      or public.is_group_member(group_id)
      or public.is_staff()
    )
    and (
      public.is_staff()
      or profile_id not in (select b.id from public.blocked_ids() as b (id))
    )
  );

/*
 * group_messages BEFORE: is_group_member(group_id)
 * AFTER: members or staff, minus blocked authors.
 *
 * NOW HIDDEN: what a blocked person says in a group you are both in. This is
 * the one that matters — a shared group was, until this line, a place a
 * blocked person could still be read at length every day.
 *
 * The staff arm is new and is the reason moderation can act at all: a reported
 * group message was, before this file, unreadable by the desk reviewing it.
 */
drop policy if exists group_messages_select on public.group_messages;
create policy group_messages_select on public.group_messages
  for select to authenticated
  using (
    (public.is_group_member(group_id) or public.is_staff())
    and (
      public.is_staff()
      or author_id not in (select b.id from public.blocked_ids() as b (id))
    )
  );

/* ---- What a block deliberately does NOT hide ----------------------------- */

/*
 * Written down because each one is a decision, and an undocumented omission
 * reads as an oversight to the next person.
 *
 * DIRECT MESSAGES (`threads`, `messages`). Untouched. Blocking has ended the
 * conversation at the write path since 20260818090000 — `messages_insert`
 * tests `blocked_in_thread()`, symmetrically, so neither side can send another
 * word. Hiding the HISTORY as well would take a record away from the person
 * who blocked: dates, what was agreed, and the evidence for the one report
 * reason that costs a climber most, `off_platform_payment`. And it would take
 * it from the blocked party too, who cannot unblock to get it back. Nothing
 * new is exposed by leaving it: the other person already received every
 * message in it. If the owner wants blocked conversations out of the inbox,
 * that is a filter on a list, not a policy that deletes a receipt.
 *
 * COMPANY CHANNELS (`channel_messages`). Untouched. A channel is a company
 * broadcasting to people who joined it, and the author is whichever staffer
 * pressed send. Hiding a company's announcements because you blocked one of
 * its employees is a surprise, and the remedy for not wanting a company's
 * messages already exists and is called leaving the channel.
 *
 * OFFERS. Untouched. An offer is a priced commitment made to one named person;
 * a block is not a way to make a quote you were given disappear.
 *
 * SUMMIT LOGS. Nothing to do — `summit_logs_select` is an EXISTS over `posts`,
 * so it already inherits every line of the new `posts_select`.
 *
 * FLAGGED, NOT DECIDED: there is no way to report a GROUP itself — a group
 * with an abusive name has no message to report and the founder is only
 * indirectly the subject. That would be a `group_id` column here and a queue
 * that renders it; the owner has not been asked, and a report kind nothing
 * displays is worse than none.
 */

/* ==========================================================================
 * PART 4 — Staff can act, and the acting is recorded
 * ========================================================================== */

/*
 * WHAT WAS ALREADY THERE, checked rather than assumed:
 *   posts_delete         → author OR company admin OR is_staff()   ✔
 *   post_comments_delete → author OR is_staff()                    ✔
 *   summit_logs_delete   → author OR is_staff()                    ✔
 * and `posts`/`post_comments` already write the whole deleted row into
 * `audit_events` on the way out (20260831190000), as `groups` does.
 *
 * WHAT WAS MISSING: the two message tables. A moderator could read a reported
 * group message (now) but not remove it, and could remove nothing at all from
 * a company channel. Neither table left a trace when anyone deleted anything.
 */

/*
 * group_messages_delete BEFORE:
 *   (author_id = (select auth.uid())) OR is_group_founder(group_id)
 * AFTER: the same, plus staff.
 */
drop policy if exists group_messages_delete on public.group_messages;
create policy group_messages_delete on public.group_messages
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_group_founder(group_id)
    or public.is_staff()
  );

/*
 * channel_messages_delete BEFORE:
 *   EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND is_company_admin(c.company_id))
 * AFTER: the same, plus staff.
 *
 * The author is still NOT on this list, which is the company's own rule from
 * 20260902180000: a channel message is the company speaking, so the company's
 * admin withdraws it, not whichever staffer typed it.
 */
drop policy if exists channel_messages_delete on public.channel_messages;
create policy channel_messages_delete on public.channel_messages
  for delete to authenticated
  using (
    exists (
      select 1 from public.channels c
       where c.id = channel_id and public.is_company_admin(c.company_id)
    )
    or public.is_staff()
  );

/**
 * The trace, for the tables that had none.
 *
 * Same pattern as `posts_delete_audit`: DEFINER, a direct insert, the whole
 * deleted row in `previous`. Deletion is a real power here — an author owns
 * their words, a founder keeps their group's conversation, staff moderate — so
 * every use of it is reviewable, and the words survive in a staff-only table
 * even when the report about them arrives after the delete.
 *
 * `record_audit_event()` is not used: it raises for anybody who is not staff,
 * and most deletions are people removing their own words.
 */
create or replace function public.moderation_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity text;
  v_company uuid;
begin
  v_entity := case tg_table_name
                when 'group_messages' then 'group_message'
                when 'channel_messages' then 'channel_message'
                when 'summit_logs' then 'summit_log'
                else tg_table_name
              end;

  if tg_table_name = 'channel_messages' then
    -- NULL when the channel went first (cascade); the message is still logged.
    select c.company_id into v_company from public.channels c where c.id = old.channel_id;
  end if;

  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'),
     v_entity || '.deleted', v_entity, old.id::text, to_jsonb(old), null, v_company);

  return old;
end;
$$;

drop trigger if exists group_messages_delete_audit on public.group_messages;
create trigger group_messages_delete_audit
  after delete on public.group_messages
  for each row execute function public.moderation_delete_audit();

drop trigger if exists channel_messages_delete_audit on public.channel_messages;
create trigger channel_messages_delete_audit
  after delete on public.channel_messages
  for each row execute function public.moderation_delete_audit();

/* A summit log deleted on its own — the claim withdrawn, the post kept — is
   the case the post trigger cannot see. Deleted WITH its post it is logged
   twice, which is the harmless direction. */
drop trigger if exists summit_logs_delete_audit on public.summit_logs;
create trigger summit_logs_delete_audit
  after delete on public.summit_logs
  for each row execute function public.moderation_delete_audit();

/* ==========================================================================
 * Grants — a policy permits; a grant makes the privilege exist
 * ========================================================================== */

/*
 * No table grant changes. `reports` already carries select/insert/update for
 * authenticated and nothing for anon (20260818090000); the new columns inherit
 * that, and nobody gains a DELETE on a report — a filed report is not
 * withdrawable, by anyone, which is what makes the queue a record.
 *
 * `blocks` already carries select/insert/update/delete for authenticated, so
 * the block button the app still has to grow needs no schema work: insert a
 * row, delete it to unblock.
 *
 * Revoked from `anon, authenticated` BY NAME on the new function, never from
 * `public` alone: default privileges grant EXECUTE to PUBLIC and anon inherits
 * it, a trap this schema has been bitten by before.
 */
