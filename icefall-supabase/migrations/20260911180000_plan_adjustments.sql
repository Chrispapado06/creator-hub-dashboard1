-- The changes anybody has made to an athlete's training plan: which day, what
-- changed, why, when, and by whom.
--
-- ============================================================================
-- DRAFT. NOT PUSHED. NOT APPLIED.
-- ============================================================================
--
-- Written 11 September 2026 alongside `icefall-app/src/tracking/adjustments.ts`.
-- The same warning 20260903060000, 20260911120000, 20260911140000 and
-- 20260911160000 carry applies here: `supabase db push` applies EVERY pending
-- file, not this one. There is no per-file push. Check what else is waiting
-- first.
--
-- ============================================================================
-- WHERE THE ADJUSTMENTS ACTUALLY LIVE TODAY: THE DEVICE. THIS FILE CHANGES
-- THAT ONLY WHEN IT IS APPLIED.
-- ============================================================================
--
-- Until then they are one `localStorage` key in the phone app,
-- `icefall.plan.adjustments.v1`, and nothing in the app writes to the table
-- below. Deliberate rather than unfinished, for the reason 20260911160000
-- gives at length: a client that upserted into a table which does not exist
-- would fail silently, and a silent failure in a persistence layer looks
-- exactly like it working right up until somebody changes phone. The app
-- therefore says "kept on this device" on `/coach/plan/changes`, which is true
-- now and stays true until the day this is applied and a sync is written.
--
-- ============================================================================
-- WHY A TABLE OF RECORDS AND NOT A COLUMN HOLDING THE PLAN
-- ============================================================================
--
-- The obvious shape is a `training_plans` table holding the plan as it stands.
-- It is the wrong one, and the reason is the whole design of the client module:
--
--   THE PLAN IS NOT STORED ANYWHERE. `buildPlanForGoal` in
--   `icefall-app/src/tracking/training.ts` is a pure function of the objective,
--   the date and three signup answers, and it is recomputed on every render.
--   What is stored is the DIFFERENCE — the records below, applied on top.
--
-- That buys the three properties the feature is sold on, and a stored plan
-- would cost all three:
--
--   1. UNDO IS A DELETION. Take a record out of the applied set and the plan is
--      byte for byte the plan that record was never in. Against a stored plan,
--      undo is an inverse edit somebody has to write, get right, and keep right
--      as the vocabulary grows.
--   2. THE PLAN FOLLOWS THE OBJECTIVE. Move the target date and the generator
--      re-blocks every week; the athlete's own changes ride on top of the new
--      baseline instead of being frozen against the old one. A stored plan goes
--      stale the moment anything upstream of it moves.
--   3. THE HISTORY CANNOT DRIFT FROM THE CALENDAR, because the calendar is
--      built from the history. There is no second log to fall out of step.
--
-- ============================================================================
-- WHY `day` IS A DATE AND THERE IS NO WEEK NUMBER ANYWHERE IN THIS FILE
-- ============================================================================
--
-- `icefall.state.v1` already holds one keyed the other way: `sessionOverrides`
-- is keyed `${weekIndex}:${isoDate}`, and the week index does not survive the
-- plan being rebuilt. Week numbers are assigned from the training start date,
-- and how many there are comes from the gap to the target date — so moving the
-- objective renumbers them and hands week 6 a different block than it had a
-- minute ago. A record keyed on a week index would then land on a day nobody
-- pointed at, silently.
--
-- A CALENDAR DATE IS A FACT ABOUT THE WORLD RATHER THAN ABOUT THE GENERATOR.
-- It is the only key here, and adding a week number column later — even "just
-- for reporting" — re-opens the trap, because the next writer will join on it.
--
-- ============================================================================
-- `goal_id` IS NOT A FOREIGN KEY, AND THAT IS NOT AN OVERSIGHT
-- ============================================================================
--
-- There is no objectives table. An ICEFALL objective lives in the phone's own
-- store as a `customGoals` entry, and the only trace of one on the server is
-- the `objective` blob inside `athlete_profiles.answers` — a single current
-- objective, without an id, written by onboarding. So `goal_id` is the
-- device's own key, stored as text and joined to nothing.
--
-- WHAT THAT COSTS: nothing here can prove a record belongs to an objective that
-- exists, and deleting an objective on the device cannot cascade. The client
-- calls `clearAdjustmentsForGoal` instead, and a sync must send that deletion
-- rather than rely on the database noticing. Written down so the day an
-- objectives table arrives, whoever adds it knows this column is waiting to
-- become a real reference.
--
-- ============================================================================
-- NO STAFF READ. SAID ONCE, HERE.
-- ============================================================================
--
-- `why` is a sentence from a coaching conversation, and those conversations are
-- promised private in writing — `coach_conversations` and `coach_messages` in
-- 20260911160000 carry no staff escape hatch for exactly that reason. A reason
-- for easing a week is very often the reason the athlete gave for needing it
-- eased, which is their knee, their illness, or the week their father died. A
-- support tool that could read `why` would make the sentence on the chat screen
-- false for everybody, not just for the one case somebody had in mind.
--
-- WHAT THAT COSTS, PLAINLY: nobody at ICEFALL can open an athlete's plan
-- history to diagnose a complaint about a change the Coach made. A support
-- request about a session that moved is answered from the athlete's own
-- screenshot and from nothing else. That is the intended trade, and anybody
-- reversing it is changing a promise the product makes in writing.
--
-- Account deletion is covered by `on delete cascade` from `profiles`.

begin;

/* -------------------------------------------------------------------------- */
/* The records                                                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.plan_adjustments (
  -- THE CLIENT'S OWN ID, KEPT. Not a server uuid with a mapping beside it: a
  -- record that has two identities is a record two devices can insert twice,
  -- and the merge this table exists for is a union that depends on an id being
  -- the same thing everywhere. Unique per athlete, which is all the union
  -- needs — see the composite primary key below.
  id         text not null check (length(id) between 3 and 64),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- The device's objective key. Joined to nothing; see the header.
  goal_id    text not null check (length(goal_id) between 1 and 64),

  -- WHICH DAY. A date, never a week number. See the header.
  day        date not null,

  kind       text not null check (kind in ('move', 'rest', 'shorten', 'ease')),
  -- For 'move' only: the day the session goes to.
  to_day     date,
  -- For 'shorten' only: the length the session is held to. The floor matches
  -- MIN_SHORTEN_MIN in the client; below it, what comes back is not a
  -- shortened session but a different thing wearing the old title.
  minutes    integer check (minutes is null or minutes between 15 and 1440),
  -- For 'ease' only. One or two, and nothing else: three notches off a session
  -- is a rest day, and 'rest' is its own kind.
  notches    smallint check (notches is null or notches in (1, 2)),

  -- WHY, IN THE WORDS OF WHOEVER `made_by` NAMES. 240 matches MAX_WHY_CHARS in
  -- the client; longer is a client that has stopped agreeing with the app.
  why        text not null default '' check (length(why) <= 240),
  made_at    timestamptz not null default now(),
  -- 'athlete' - they changed their own plan.
  -- 'coach'   - the Coach changed it through a tool.
  -- Shown to the athlete on every row, because the two deserve different trust
  -- and flattening them into "the plan changed" is the failure this whole
  -- feature exists to prevent.
  made_by    text not null check (made_by in ('athlete', 'coach')),
  -- Records made in ONE ACT share this. "Push the week back a day" is six
  -- moves the athlete agreed to once, and undoing a sixth of it leaves a week
  -- nobody chose.
  batch_id   text check (batch_id is null or length(batch_id) between 3 and 64),

  -- UNDO. See the section below on why this is a stamp and not a delete.
  undone_at  timestamptz,

  created_at timestamptz not null default now(),

  primary key (user_id, id),

  /*
   * A KIND CARRIES ITS OWN PARAMETERS AND NOTHING ELSE.
   *
   * Without this a row can say `kind = 'rest'` and carry a `minutes` of 45,
   * and the client's applier — which switches on `kind` — would ignore it
   * while the history screen showed a row that reads as a shortening. The plan
   * and the history disagreeing is the one failure this table cannot allow, so
   * the shape is refused at the door rather than tidied up on read.
   */
  constraint plan_adjustments_kind_fields check (
    case kind
      when 'move'    then to_day is not null and minutes is null and notches is null
      when 'rest'    then to_day is null     and minutes is null and notches is null
      when 'shorten' then to_day is null     and minutes is not null and notches is null
      when 'ease'    then to_day is null     and minutes is null and notches is not null
      -- Unreachable while the `kind` check above holds, and here anyway: a
      -- CASE with no ELSE returns NULL, and a CHECK passes on NULL. Adding a
      -- fifth kind to the list above without adding it here would otherwise
      -- give that kind no field rules at all, silently.
      else false
    end
  ),

  -- A day cannot move to itself. The client strands such a record; there is no
  -- reason for one to exist at all.
  constraint plan_adjustments_move_elsewhere check (to_day is null or to_day <> day)
);

-- The plan screen's read: this athlete's changes to one objective, by day.
create index if not exists plan_adjustments_user_goal_day
  on public.plan_adjustments (user_id, goal_id, day);

-- The history screen's read: one objective's changes, newest act first.
create index if not exists plan_adjustments_user_goal_made
  on public.plan_adjustments (user_id, goal_id, made_at desc);

comment on table public.plan_adjustments is
  'One change to a generated training plan. The plan itself is never stored - it is recomputed from the objective by the client and these records are applied on top, which is what makes Undo a deletion rather than an inverse edit. Keyed on a calendar date and never on a week index, because week indices are renumbered whenever the target date moves.';

comment on column public.plan_adjustments.why is
  'The reason, in the words of whoever made_by names. Free text written by an athlete or produced by the Coach, and therefore an injection vector for as long as it exists: anything that ever assembles a prompt from this column must sanitise it and wrap it in a boundary the text cannot close, the way the app already does for coach notes.';

/* -------------------------------------------------------------------------- */
/* UNDO IS A STAMP, AND THE STAMP ONLY EVER GOES ONE WAY                      */
/* -------------------------------------------------------------------------- */

/*
 * WHY NOT A DELETE. A sync between a device and this table is a union — the
 * rule `settings/hydrate.ts` writes down as "a fetch fills and corrects; it
 * never empties", generalised from a field to a set. Under a union, a row that
 * has been hard-deleted on one device is indistinguishable from a row that
 * device has not received yet, so the next fetch would resurrect every undone
 * change: the long day the athlete moved off Saturday reappearing on Saturday,
 * weeks later, with no explanation.
 *
 * `undone_at` makes the undo a FACT THAT TRAVELS. Because it only ever goes
 * from null to a timestamp, a union in which any side's stamp wins converges
 * without a tie-break, a clock comparison or a per-field rule.
 *
 * THE RECORD IS STILL GENUINELY GONE FROM THE PLAN. The client filters undone
 * records out before the applier ever sees them, so the plan is exactly the
 * plan that record was never in. The row survives so the history can say "you
 * undid this", and so this merge converges.
 *
 * WHAT THE TRIGGER ENFORCES, AND WHY IT IS A TRIGGER AND NOT A POLICY. The
 * update policy below could carry the same test, but a policy binds
 * `authenticated` only: a service_role write, a migration, or a future Edge
 * Function bypasses RLS entirely. Monotonicity is the property the merge rests
 * on, so it is enforced where every writer there will ever be has to meet it.
 */
create or replace function public.plan_adjustment_is_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.goal_id is distinct from old.goal_id
     or new.day is distinct from old.day
     or new.kind is distinct from old.kind
     or new.to_day is distinct from old.to_day
     or new.minutes is distinct from old.minutes
     or new.notches is distinct from old.notches
     or new.why is distinct from old.why
     or new.made_at is distinct from old.made_at
     or new.made_by is distinct from old.made_by
     or new.batch_id is distinct from old.batch_id
  then
    raise exception 'a plan adjustment is a record of what was decided; only undone_at may change';
  end if;

  /* Null to a timestamp, once. Never back, and never re-stamped: a second
     stamp would be a different answer to "when was this undone", and the
     history screen prints that date. */
  if old.undone_at is not null and new.undone_at is distinct from old.undone_at then
    raise exception 'an undone adjustment cannot be undone again or restored';
  end if;

  return new;
end;
$$;

revoke all on function public.plan_adjustment_is_append_only() from public, anon;

drop trigger if exists plan_adjustment_append_only on public.plan_adjustments;
create trigger plan_adjustment_append_only
  before update on public.plan_adjustments
  for each row execute function public.plan_adjustment_is_append_only();

/* -------------------------------------------------------------------------- */
/* RLS - owner only, with no staff exception                                  */
/* -------------------------------------------------------------------------- */

alter table public.plan_adjustments enable row level security;
alter table public.plan_adjustments force row level security;

-- `force`, including for the table owner, for the same reason the four tables
-- in 20260911160000 carry it: this is where a stray `security definer`
-- function written later would otherwise read everybody's coaching reasons by
-- accident.

drop policy if exists plan_adjustments_select on public.plan_adjustments;
create policy plan_adjustments_select on public.plan_adjustments
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists plan_adjustments_insert on public.plan_adjustments;
create policy plan_adjustments_insert on public.plan_adjustments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

/*
 * UPDATE IS GRANTED ONLY SO UNDO CAN BE RECORDED. The trigger above is what
 * decides which column may move; this policy decides whose row it is. Both are
 * needed and neither substitutes for the other.
 */
drop policy if exists plan_adjustments_update on public.plan_adjustments;
create policy plan_adjustments_update on public.plan_adjustments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/*
 * DELETE IS GRANTED, AND IT IS NOT WHAT UNDO USES.
 *
 * It exists for the two cases that are genuinely a removal rather than a
 * reversal: an objective the athlete has deleted, which cannot cascade because
 * there is no objectives table, and "erase everything" in Settings. Anything
 * that calls this as an undo has reintroduced the resurrection bug the
 * `undone_at` section describes.
 */
drop policy if exists plan_adjustments_delete on public.plan_adjustments;
create policy plan_adjustments_delete on public.plan_adjustments
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.plan_adjustments from anon, authenticated;
grant select, insert, update, delete on public.plan_adjustments to authenticated;

/* -------------------------------------------------------------------------- */
/* What is deliberately NOT in this file                                      */
/* -------------------------------------------------------------------------- */

/*
 * NO STORED PLAN, NO GENERATED SESSION, NO TITLE, NO DISTANCE, NO ELEVATION.
 * Rule 1 — the AI decides, the app's engines do the work — has a shape in the
 * schema as well as in the code: there is no column here a model could put a
 * workout in. The vocabulary is four actions and a day, and every figure the
 * athlete reads is computed by the client from the generator's baseline. A
 * future column called `custom_session` or `override_json` would quietly undo
 * that, whatever the code around it promised.
 *
 * NO RETENTION SWEEP, for the reason 20260911160000 gives: a record of what
 * somebody changed about their own training is theirs, and a job that deleted
 * it on a timer without their asking is the app deciding what a person is
 * allowed to keep. The delete they control is on `/coach/plan/changes`; the one
 * they cannot avoid is deleting the account, which cascades.
 *
 * NO SERVER-SIDE CAP. The client keeps two hundred records per objective
 * because `localStorage` is a hard 5 MB shared with every other `icefall.` key.
 * Postgres has no such pressure, and a cap that silently deleted the older half
 * of somebody's plan history to match a browser limitation would be the
 * device's problem imposed on their record.
 *
 * NO TRIGGER THAT VALIDATES A CHANGE AGAINST A PLAN, because the plan does not
 * exist here to validate against. Whether a record can actually apply is
 * decided by `applyAdjustments` against the baseline of the moment, and a
 * record that cannot is returned as STRANDED and said out loud on the history
 * screen rather than deleted. A database that refused such a row would be
 * throwing away the only evidence that a change the athlete was told about no
 * longer holds.
 */

commit;
