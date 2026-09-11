-- The Coach's memory: the conversations an athlete has had, and the short
-- durable notes the Coach carries between them.
--
-- ============================================================================
-- DRAFT. NOT PUSHED. NOT APPLIED.
-- ============================================================================
--
-- Written 11 September 2026 alongside `icefall-app/src/coach/conversations.ts`
-- and `icefall-app/src/coach/notes.ts`. The same warning 20260903060000,
-- 20260911120000 and 20260911140000 carry applies here: `supabase db push`
-- applies EVERY pending file, not this one. There is no per-file push. Check
-- what else is waiting first.
--
-- ============================================================================
-- WHERE THE MEMORY ACTUALLY LIVES TODAY: THE DEVICE. THIS FILE CHANGES THAT
-- ONLY WHEN IT IS APPLIED.
-- ============================================================================
--
-- Until then, both stores are `localStorage` keys in the phone app -
-- `icefall.coach.conversations.v1` and `icefall.coach.notes.v1` - and nothing
-- in the app writes to the tables below. That is deliberate rather than
-- unfinished: a client that upserted into a table which does not exist would
-- fail silently, and a silent failure in a persistence layer looks exactly
-- like it working right up until somebody changes phone. The app therefore
-- says "kept on this device" on its memory screen, which is true now and stays
-- true until the day this is applied and a sync is written.
--
-- SO THIS FILE IS NOT LOAD-BEARING YET. Read it as the shape the memory will
-- take, with the access rules decided while they are cheap to decide, and not
-- as a description of where anybody's data is.
--
-- ============================================================================
-- WHY THESE TABLES AND NOT A JSONB BLOB ON `athlete_profiles`
-- ============================================================================
--
-- `athlete_profiles.answers` already holds an untyped blob, and it would have
-- taken ten minutes to push the transcript in beside it. Three reasons not to:
--
--   1. A BLOB CANNOT BE PARTIALLY DELETED BY POLICY. The athlete's right to
--      remove one note is the whole justification for the feature (a coach
--      that remembers things about you that you cannot remove is surveillance,
--      not coaching). With a blob, deleting one note is a read-modify-write by
--      the client, and two devices doing it at once silently restore each
--      other's deletions. With a row, `delete` means delete.
--   2. A TRANSCRIPT GROWS WITHOUT BOUND. `answers` is upserted whole on every
--      onboarding write; a conversation appended to a blob would rewrite the
--      entire history on every message.
--   3. THEY WANT DIFFERENT ACCESS. See the RLS section: `athlete_profiles` is
--      readable by an admin. These are not.
--
-- ============================================================================
-- NO STAFF READ. NOT ON ANY TABLE IN THIS FILE. SAID ONCE, HERE.
-- ============================================================================
--
-- `athlete_profiles_select` ends `or public.is_admin()`, and most owner-owned
-- tables in this schema carry a staff escape hatch of some kind. These four do
-- not, and it is the most consequential decision in the file.
--
-- The chat screen tells the athlete "Private - separate from Social" before
-- they have typed a word, and what people type into it is what they type to a
-- coach: their body, their fear about a date, the thing they have not told
-- their climbing partner. A policy that lets a support tool read that makes
-- the sentence on the screen false, and it would be false for everybody rather
-- than for the one case somebody had in mind when they added the clause.
--
-- WHAT THAT COSTS, PLAINLY, because it is not free: nobody at ICEFALL can open
-- a transcript to diagnose a complaint about an answer the Coach gave. A
-- support request about a bad reply can be answered from the athlete's own
-- screenshot and from nothing else. That is the intended trade, and anybody
-- reversing it is changing a promise the product makes in writing, not tuning
-- a permission.
--
-- Account deletion is covered by `on delete cascade` from `profiles`, so
-- deleting an account takes the memory with it without a sweep function.

begin;

/* -------------------------------------------------------------------------- */
/* Conversations                                                              */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Kept apart from `created_at` because the app orders by last activity and
  -- shows the start date: a thread begun in March and answered in September is
  -- both, and collapsing them loses the one the athlete recognises it by.
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- The memory screen's list: this athlete's threads, most recent first.
create index if not exists coach_conversations_user_recent
  on public.coach_conversations (user_id, updated_at desc);

comment on table public.coach_conversations is
  'One Coach conversation. Deliberately holds no title: a title derived by a model would be a claim about a private conversation that only the person who had it can make. The app derives the label from the first thing the athlete typed.';

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations (id) on delete cascade,
  -- DENORMALISED ON PURPOSE. Every policy below is `user_id = auth.uid()`, and
  -- routing that through a join to `coach_conversations` would run the join on
  -- every row of every read. The trigger under this table is what keeps the
  -- two in step, so it cannot drift from its conversation's owner.
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('athlete', 'coach')),
  -- 8,000 rather than unlimited: the Edge Function already clamps a question
  -- to 2,000 characters and a reply to 900 tokens, so anything near this is a
  -- client that has stopped agreeing with the server about what a message is.
  body            text not null check (length(body) between 1 and 8000),
  -- The caution strip under a safety answer. NULL on an ordinary reply, and
  -- stored rather than recomputed because the disclaimer that was SHOWN is
  -- what the athlete read - re-deriving it later would rewrite history if the
  -- wording ever changes.
  disclaimer      text check (disclaimer is null or length(disclaimer) <= 2000),
  said_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists coach_messages_conversation
  on public.coach_messages (conversation_id, said_at);

create index if not exists coach_messages_user
  on public.coach_messages (user_id);

/*
 * A message cannot belong to somebody else's conversation, and its `user_id`
 * cannot disagree with the thread it is in.
 *
 * The insert policy already checks both halves, but a policy is enforced for
 * `authenticated` only - a service_role write, a migration, or a future Edge
 * Function bypasses RLS entirely. This trigger is the one that holds for every
 * writer there will ever be, which is what the denormalised column needs if it
 * is to be trusted by the policies above it.
 */
create or replace function public.coach_message_owner_matches_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.coach_conversations where id = new.conversation_id;
  if v_owner is null then
    raise exception 'conversation % does not exist', new.conversation_id;
  end if;
  if v_owner is distinct from new.user_id then
    raise exception 'a coach message belongs to the owner of its conversation';
  end if;
  return new;
end;
$$;

revoke all on function public.coach_message_owner_matches_conversation() from public, anon;

drop trigger if exists coach_message_owner_matches on public.coach_messages;
create trigger coach_message_owner_matches
  before insert or update on public.coach_messages
  for each row execute function public.coach_message_owner_matches_conversation();

/*
 * The thread's `updated_at` follows its last message, so the memory screen can
 * order threads without reading every message in each one.
 */
create or replace function public.coach_conversation_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_conversations
     set updated_at = greatest(updated_at, new.said_at)
   where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.coach_conversation_touch() from public, anon;

drop trigger if exists coach_conversation_touch on public.coach_messages;
create trigger coach_conversation_touch
  after insert on public.coach_messages
  for each row execute function public.coach_conversation_touch();

comment on table public.coach_messages is
  'One turn of a Coach conversation. No UPDATE policy: a transcript is a record of what was said, and silently editing a coach answer after somebody has trained on it is the failure summit_logs already refuses. Wrong answers are deleted with the thread, not rewritten.';

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- THE ATHLETE'S OWN SENTENCE, VERBATIM. Never a model's summary of them: the
  -- capture rules are plain code in `src/coach/notes.ts` and what they store is
  -- the sentence that matched, unedited. 180 matches MAX_NOTE_CHARS there; a
  -- longer value is a client that has drifted from the app.
  note       text not null check (length(btrim(note)) between 3 and 180),
  category   text not null check (category in ('schedule', 'body', 'target', 'preference', 'constraint')),
  -- 'captured' - recognised in something they typed to the Coach.
  -- 'typed'    - they wrote it themselves on the memory screen.
  -- Shown to the athlete, because the two deserve different trust, and kept
  -- here so that distinction survives a device change rather than being
  -- flattened into "the app knows this about you".
  source     text not null check (source in ('captured', 'typed')),
  created_at timestamptz not null default now()
);

create index if not exists coach_notes_user_recent
  on public.coach_notes (user_id, created_at desc);

/*
 * THE SAME FACT IS NOT KEPT TWICE. Without this, an athlete who says "I train
 * Tuesday and Thursday" in three conversations has that sentence weighted three
 * times in every prompt from then on, which is how a passing remark becomes the
 * loudest thing the Coach believes about somebody.
 *
 * Case- and space-insensitive, matching `fingerprint()` in the client closely
 * enough to be the same rule twice rather than two rules that disagree.
 */
create unique index if not exists coach_notes_no_duplicates
  on public.coach_notes (user_id, lower(regexp_replace(note, '\s+', ' ', 'g')));

comment on table public.coach_notes is
  'Short durable facts the Coach carries between conversations, in the athlete''s own words. No model writes these and no UPDATE policy exists: a verbatim quote that can be edited is no longer verbatim. The athlete corrects one by deleting it and adding what they meant.';

/* -------------------------------------------------------------------------- */
/* Whether to remember at all                                                 */
/* -------------------------------------------------------------------------- */

create table if not exists public.coach_memory_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  -- FALSE STOPS CAPTURE. It does not hide anything already kept, and it is not
  -- a filter applied at read time: a preference that quietly keeps collecting
  -- while showing nothing is the exact thing this feature must not be.
  capture    boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.coach_memory_prefs is
  'One row per athlete: whether the Coach may keep new notes from what they say. Absent row means the default, true - the same thing the app assumes when the key is missing from localStorage.';

/* -------------------------------------------------------------------------- */
/* RLS - owner only, on all four, with no staff exception                     */
/* -------------------------------------------------------------------------- */

alter table public.coach_conversations enable row level security;
alter table public.coach_conversations force row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_messages force row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_notes force row level security;
alter table public.coach_memory_prefs enable row level security;
alter table public.coach_memory_prefs force row level security;

-- `force` on all four, including for the table owner. These are the tables
-- where a stray `security definer` function written later would otherwise read
-- everybody's transcripts by accident.

drop policy if exists coach_conversations_select on public.coach_conversations;
create policy coach_conversations_select on public.coach_conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists coach_conversations_insert on public.coach_conversations;
create policy coach_conversations_insert on public.coach_conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists coach_conversations_update on public.coach_conversations;
create policy coach_conversations_update on public.coach_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists coach_conversations_delete on public.coach_conversations;
create policy coach_conversations_delete on public.coach_conversations
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.coach_conversations from anon, authenticated;
grant select, insert, update, delete on public.coach_conversations to authenticated;

drop policy if exists coach_messages_select on public.coach_messages;
create policy coach_messages_select on public.coach_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists coach_messages_insert on public.coach_messages;
create policy coach_messages_insert on public.coach_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.coach_conversations c
       where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

/*
 * NO UPDATE POLICY, matching `posts`, `summit_logs` and `channel_messages`. A
 * transcript is a record of what was said. Editing a coach answer after the
 * athlete has trained on it - or editing their own question so the answer
 * reads differently - is rewriting history, and the honest correction is to
 * delete the thread.
 */

drop policy if exists coach_messages_delete on public.coach_messages;
create policy coach_messages_delete on public.coach_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.coach_messages from anon, authenticated;
grant select, insert, delete on public.coach_messages to authenticated;

drop policy if exists coach_notes_select on public.coach_notes;
create policy coach_notes_select on public.coach_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists coach_notes_insert on public.coach_notes;
create policy coach_notes_insert on public.coach_notes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

/*
 * NO UPDATE POLICY HERE EITHER, and for a different reason from the messages.
 * The value of a note is that it is the athlete's own sentence, word for word;
 * a note that can be edited in place is no longer a quotation of anything. The
 * screen corrects one by deleting it and adding what they meant, which leaves
 * the source honest.
 */

drop policy if exists coach_notes_delete on public.coach_notes;
create policy coach_notes_delete on public.coach_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.coach_notes from anon, authenticated;
grant select, insert, delete on public.coach_notes to authenticated;

drop policy if exists coach_memory_prefs_select on public.coach_memory_prefs;
create policy coach_memory_prefs_select on public.coach_memory_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists coach_memory_prefs_upsert on public.coach_memory_prefs;
create policy coach_memory_prefs_upsert on public.coach_memory_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists coach_memory_prefs_update on public.coach_memory_prefs;
create policy coach_memory_prefs_update on public.coach_memory_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.coach_memory_prefs from anon, authenticated;
grant select, insert, update on public.coach_memory_prefs to authenticated;

/* -------------------------------------------------------------------------- */
/* What is deliberately NOT in this file                                      */
/* -------------------------------------------------------------------------- */

/*
 * NO RETENTION SWEEP. `coach_limits` has `coach_sweep_usage` because a usage
 * ledger is ICEFALL's own bookkeeping and nobody is entitled to have last
 * year's counts kept. A conversation is the athlete's, and a job that deleted
 * their coaching history on a timer - without their asking, and without their
 * being told when they wrote it - is the app deciding what somebody is allowed
 * to keep. The delete they control is on `/coach/memory`; the one they cannot
 * avoid is deleting the account, which cascades.
 *
 * If a retention period is ever wanted, it is a product decision that has to be
 * SAID on that screen before it is enforced here.
 *
 * NO SERVER-SIDE CAP ON THREADS OR MESSAGES. The client keeps twenty threads of
 * a hundred and twenty messages because localStorage is a hard 5 MB shared with
 * every other ICEFALL key. Postgres has no such pressure, and a server cap that
 * silently deleted the older half of somebody's history to match a browser
 * limitation would be the device's problem imposed on their record.
 *
 * NOTHING HERE READS OR WRITES A PROMPT. The notes reach the model through
 * `notesForPrompt` and `notesBlock` in the app, which sanitise every line and
 * wrap it in a boundary the text cannot close. A note is athlete-typed free
 * text and therefore an injection vector for as long as it exists - longer than
 * the onboarding limitations note, because it is read back on every turn. The
 * database stores it; it does not make it safe, and no future function here
 * should assemble a prompt from these columns without doing what the app does.
 */

commit;
