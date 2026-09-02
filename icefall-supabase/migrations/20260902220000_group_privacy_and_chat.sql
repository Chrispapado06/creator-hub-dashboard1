/* ==========================================================================
 * Groups become places: public or private, with a roster and a conversation.
 *
 * The owner, 2026-09-02:
 *   "in a group once they join they can see details people in etc chat send
 *    images and stuff. If you create a group you have option to be public or
 *    private accept"
 *
 * Four things, and the security of all four is one idea: MEMBERSHIP IS THE KEY.
 *
 *   1. `visibility` on a group — public or private.
 *   2. A public group is JOINED. A private group is REQUESTED, and the founder
 *      accepts. The difference is enforced in the insert policy, not the UI.
 *   3. The ROSTER is members-only. "Once they join they can see people in" is a
 *      privacy promise to the people already in it — a stranger must not be able
 *      to read who is going up a mountain and when.
 *   4. A conversation, with images, readable and writable by members only.
 *
 * WHAT A STRANGER MAY SEE, and it is deliberately little: that the group exists,
 * its name, its mountain, and how many people are in it. Enough to decide
 * whether to join or ask. Not who, and not what was said.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* 1. visibility                                                              */
/* -------------------------------------------------------------------------- */

alter table public.groups
  add column if not exists visibility text not null default 'public';

alter table public.groups drop constraint if exists groups_visibility_known;
alter table public.groups
  add constraint groups_visibility_known check (visibility in ('public', 'private'));

comment on column public.groups.visibility is
  'public = anyone signed in may join outright. private = they may only request, and '
  'the founder accepts. Defaults to public because that is the safer failure: a group '
  'that is more open than intended is visible and fixable, one that is silently closed '
  'looks broken to everyone trying to join it.';

/* A membership-shaped helper, because four policies below ask the same question
   and a fourth copy of the same EXISTS is how one of them ends up subtly
   different. DEFINER so a non-member can be told "no" without being able to
   read the roster to work that out. */
create or replace function public.is_group_member(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = g and m.profile_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

create or replace function public.is_group_founder(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.groups gr
     where gr.id = g and gr.created_by = (select auth.uid())
  );
$$;

revoke all on function public.is_group_founder(uuid) from public, anon;
grant execute on function public.is_group_founder(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/* 2. join requests — private groups only                                     */
/* -------------------------------------------------------------------------- */

create table if not exists public.group_join_requests (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  /* One outcome, and the timestamps carry it — the same shape `offers` uses.
     A decided request is kept rather than deleted so somebody who was declined
     cannot re-ask every hour and so the founder can see what they decided. */
  accepted_at timestamptz,
  declined_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  primary key (group_id, profile_id),
  constraint group_request_one_outcome check (
    (accepted_at is not null)::int + (declined_at is not null)::int <= 1
  )
);

create index if not exists group_join_requests_group_idx
  on public.group_join_requests (group_id, requested_at)
  where accepted_at is null and declined_at is null;

/* -------------------------------------------------------------------------- */
/* 3. the conversation                                                        */
/* -------------------------------------------------------------------------- */

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  /* RESTRICT: a message stays attributable. Someone deleting their account
     does not silently orphan what they said to a party planning a mountain. */
  author_id uuid not null references public.profiles (id) on delete restrict,
  /* Nullable so a message can be an image with no words — but not both null;
     see the constraint. */
  body text check (body is null or length(trim(body)) between 1 and 4000),
  media_path text,
  media_meta jsonb,
  created_at timestamptz not null default now(),
  constraint group_message_has_content check (
    body is not null or media_path is not null
  )
);

create index if not exists group_messages_group_idx
  on public.group_messages (group_id, created_at desc);

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.group_join_requests enable row level security;
alter table public.group_messages enable row level security;

/* ---- groups: discovery stays open, contents do not ------------------------ */

/*
 * A group row is readable by anyone signed in, PUBLIC OR PRIVATE. That is
 * deliberate: a private group you cannot see is a private group you can never
 * ask to join, and "private" here means closed membership, not secret
 * existence. What the row carries is a name, a mountain and a date — the roster
 * and the conversation are separate tables with their own policies, and those
 * are where privacy actually lives.
 */
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (true);

/*
 * JOINING. This is the whole public/private distinction, in one policy.
 *
 * You may always insert YOURSELF, never anybody else. Beyond that:
 *   public   — go ahead.
 *   private  — only if you hold an ACCEPTED request. A self-insert into a
 *              private group is refused here, so the UI cannot get it wrong and
 *              neither can curl.
 * The founder is exempted so creating a group can seat its founder in the same
 * breath, including a private one.
 */
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (
      public.is_group_founder(group_id)
      or exists (
        select 1 from public.groups g
         where g.id = group_id and g.visibility = 'public'
      )
      or exists (
        select 1 from public.group_join_requests r
         where r.group_id = group_members.group_id
           and r.profile_id = (select auth.uid())
           and r.accepted_at is not null
      )
    )
  );

/*
 * THE ROSTER IS MEMBERS-ONLY. This is the owner's "once they join they can see
 * people in", read as the promise it makes to the people already inside: a
 * stranger cannot enumerate who is going up a mountain and when.
 *
 * You can always see your own row, so leaving works and so a pending person can
 * tell they are not in yet.
 */
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_group_member(group_id));

drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (profile_id = (select auth.uid()) or public.is_group_founder(group_id));

/* ---- requests ------------------------------------------------------------- */

drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select on public.group_join_requests
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_group_founder(group_id));

/*
 * You ask for yourself, and only for a private group — asking to join a public
 * group is not a thing, you simply join.
 *
 * AND THE ASK MUST ARRIVE UNDECIDED. Without the three NULL checks below this
 * policy is a self-admission hole, in two statements:
 *
 *   insert into group_join_requests (group_id, profile_id, accepted_at)
 *     values (<any private group>, auth.uid(), now());
 *   insert into group_members (group_id, profile_id)
 *     values (<same group>, auth.uid());
 *
 * — because `group_members_insert` admits anyone holding a request with
 * `accepted_at` set, and nothing here stopped the requester setting it on the
 * way in. "Private" would have been decorative against anyone not using the app.
 * A request is a QUESTION; only `group_join_requests_update`, which is founder-
 * only, may write the answer.
 */
drop policy if exists group_join_requests_insert on public.group_join_requests;
create policy group_join_requests_insert on public.group_join_requests
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and accepted_at is null
    and declined_at is null
    and decided_by is null
    and exists (
      select 1 from public.groups g
       where g.id = group_id and g.visibility = 'private'
    )
  );

/* The founder decides. `with check` repeats the founder test because a USING
   clause alone would let a founder hand the decision to somebody else by
   rewriting the row. The founder may only answer a request aimed at their own
   group — they cannot move it to another group, which would let them admit
   somebody to a group they do not own. */
drop policy if exists group_join_requests_update on public.group_join_requests;
create policy group_join_requests_update on public.group_join_requests
  for update to authenticated
  using (public.is_group_founder(group_id))
  with check (
    public.is_group_founder(group_id)
    and decided_by = (select auth.uid())
  );

/* Withdrawing your own ask. */
drop policy if exists group_join_requests_delete on public.group_join_requests;
create policy group_join_requests_delete on public.group_join_requests
  for delete to authenticated
  using (profile_id = (select auth.uid()));

/* ---- messages ------------------------------------------------------------- */

drop policy if exists group_messages_select on public.group_messages;
create policy group_messages_select on public.group_messages
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_insert on public.group_messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_group_member(group_id));

/* No UPDATE policy, matching `posts` and `channel_messages`: what was said to a
   party planning a mountain is stood behind or deleted, never quietly rewritten
   under the replies to it. */
drop policy if exists group_messages_delete on public.group_messages;
create policy group_messages_delete on public.group_messages
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_group_founder(group_id));

/* -------------------------------------------------------------------------- */
/* Storage — group images                                                     */
/* -------------------------------------------------------------------------- */

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'no storage schema (PGlite?) — skipping the group-media bucket';
    return;
  end if;

  /*
   * A SEPARATE BUCKET, NOT `post-media`.
   *
   * post-media reads are open to any authenticated user — a known and recorded
   * hole in 20260902160000. Putting group images there would make a private
   * group's photographs readable by anyone signed in, which is the exact
   * promise this migration exists to keep. So: its own bucket, read gated on
   * membership.
   *
   * PATH: <group_id>/<uploader_uid>/<filename>. Group id FIRST because the read
   * policy matches on it, exactly as operator-media matches on company id.
   */
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('group-media', 'group-media', false, 26214400)
    on conflict (id) do update set public = false, file_size_limit = 26214400
  $sql$;

  execute $sql$ drop policy if exists group_media_read on storage.objects $sql$;
  execute $sql$
    create policy group_media_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'group-media'
        and public.is_group_member(((storage.foldername(name))[1])::uuid)
      )
  $sql$;

  execute $sql$ drop policy if exists group_media_insert on storage.objects $sql$;
  execute $sql$
    create policy group_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'group-media'
        and public.is_group_member(((storage.foldername(name))[1])::uuid)
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
  $sql$;

  execute $sql$ drop policy if exists group_media_delete on storage.objects $sql$;
  execute $sql$
    create policy group_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'group-media'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
  $sql$;
exception
  when insufficient_privilege then
    /* One storage policy must never take a push down — the lesson of
       20260902160000. Skip loudly; the tables above are already committed. */
    raise warning 'group-media bucket/policies NOT created: %', sqlerrm;
    raise warning 'Create by hand: Storage -> New bucket "group-media", PRIVATE, 25MB, then policies keyed on (storage.foldername(name))[1] being a group the caller is a member of.';
end $$;

/* -------------------------------------------------------------------------- */
/* Table privileges                                                           */
/* -------------------------------------------------------------------------- */

revoke all on public.group_join_requests from anon, authenticated;
revoke all on public.group_messages from anon, authenticated;

grant select, insert, update, delete on public.group_join_requests to authenticated;
-- No UPDATE on messages: see the missing update policy above.
grant select, insert, delete on public.group_messages to authenticated;
