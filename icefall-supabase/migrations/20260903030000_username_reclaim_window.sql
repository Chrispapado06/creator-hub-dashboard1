/* ==========================================================================
 * ICEFALL — changing your handle, and the 14 days it stays yours to take back.
 *
 * THE OWNER, 2026-09-03: "make it so if you want to change username you can,
 * but once you do you have 14 to claim it back if you dont then someone else
 * can get it."
 *
 * ── THE SURPRISE: HALF OF THAT ALREADY WORKS ───────────────────────────────
 *
 * Checked against the live database, not remembered. `claim_username()` is
 * SECURITY DEFINER and its body is a plain
 *
 *     update public.profiles set username = c where id = auth.uid();
 *
 * with NO condition that the current username is null. So a second call simply
 * replaces the handle: changing it has been possible since 20260830100000
 * shipped. `profiles_update_self` forbids moving `username` by a DIRECT table
 * update — which is what pins every change to this one function — but the
 * definer bypasses RLS by design, which is the whole point of it existing.
 *
 * So the thing to BUILD is not "allow changing". It is the half that does not
 * exist at all: today the handle somebody walks away from is free to the next
 * person in the same millisecond. There is no record that it was ever theirs,
 * nothing to hold it, and nothing to take back.
 *
 * That gap is not academic. The people most likely to change a handle are the
 * people who just found out theirs is being used against them, and the people
 * most likely to be watching for the vacancy are the ones they are running
 * from. A hold is the difference between "I changed my mind" and "somebody
 * else is now @me".
 *
 * ── THE MODEL, IN ONE PARAGRAPH ────────────────────────────────────────────
 *
 * Leaving a handle writes a RELEASE: the handle, who left it, when, and when
 * the hold ends. While that hold is live the handle may be claimed by exactly
 * one person — the one who left it. When they take it back, the release is
 * deleted and the hold is over. When the window passes, the release stops
 * meaning anything and the handle is ordinary again: first person to commit
 * the row wins, arbitrated by `profiles_username_key` exactly as before.
 *
 * ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
 *
 * It does not rate-limit handle changes, and Q2 below says plainly what that
 * leaves open rather than implying the hold closes it. It does not touch the
 * app: `icefall-app/src/auth/username.ts` maps any reason it does not know to
 * `format`, so the new `held` refusal will currently read "Pick a username."
 * until the UI is wired separately. It does not edit 20260830100000 — that
 * file is applied and an edit to it would never run (the lesson of
 * 20260902190000).
 * ========================================================================== */

/* ==========================================================================
 * 1. FOURTEEN DAYS, WRITTEN ONCE
 * ========================================================================== */

/*
 * The owner said fourteen. This is the only place in the schema that says it.
 * A function rather than a literal repeated across three bodies, because the
 * day that number becomes thirty is the day a repeated literal becomes two
 * different products: an availability check that says one thing and a claim
 * that does another.
 *
 * IMMUTABLE and takes no argument, so it costs nothing at the call site and
 * can be read by the app to print the promise ("14 days") from the same source
 * that enforces it, rather than a hardcoded string in a sentence.
 */
create or replace function public.username_hold_window()
returns interval
language sql
immutable
as $$ select interval '14 days'; $$;

comment on function public.username_hold_window() is
  'How long a released handle stays reserved for the person who released it. '
  'THE ONLY DEFINITION OF THAT NUMBER — every stored expiry is computed from '
  'this, and the app should read it rather than repeat it in a sentence.';

/* ==========================================================================
 * 2. THE RELEASE RECORD
 * ========================================================================== */

/*
 * ONE ROW PER HANDLE, and the handle is the primary key. Every question this
 * table is ever asked is "is THIS handle held, and by whom" — a primary-key
 * equality lookup, which is what keeps the check free on the claim path
 * forever (see Q4 on growth).
 *
 * STORED EXPIRY, NOT COMPUTED FROM `released_at`. The tempting alternative is
 * a view or an expression — `released_at + username_hold_window()` — which by
 * construction can never drift from the constant. It is still the wrong
 * choice, for two reasons that outrank drift:
 *
 *   1. IT REWRITES PROMISES ALREADY MADE. The moment the window changes from
 *      14 days to 30, a computed expiry silently extends every hold in flight,
 *      including holds the app has already drawn a countdown for. Somebody
 *      told "6 days left" yesterday is told "22 days left" today, and neither
 *      number was ever wrong — which is worse than one of them being wrong,
 *      because the product now has no fixed word. Shortening is uglier still:
 *      live holds would expire retroactively, in the past.
 *   2. IT CANNOT BE ADJUSTED, AND ADJUSTMENT IS THE POINT OF SUPPORT. A person
 *      whose account was compromised and whose handle was changed BY SOMEBODY
 *      ELSE needs the hold extended past fourteen days while it is
 *      investigated. Someone who released a handle by mistake and wants it
 *      freed for a friend needs it cut short. An expression can do neither
 *      without a schema change.
 *
 * The drift the computed form protects against is answered instead by there
 * being exactly ONE writer: `claim_username()` computes the value from
 * `username_hold_window()` at insert. The CHECK is deliberately loose —
 * expiry after release, nothing more — because pinning it to the constant
 * would take back the adjustability the stored column was chosen for.
 *
 * The one thing that CHECK does refuse is an expiry before the release, which
 * is not a shortened hold but a nonsense one. Ending a hold immediately is a
 * DELETE of the row, not a backdated timestamp — and it means the same thing
 * to every reader, because every reader tests the expiry rather than the row's
 * existence.
 */
create table if not exists public.username_releases (
  /* The handle that was left. Always lowercase: it arrives from
     `profiles.username`, whose CHECK makes uppercase impossible by any path. */
  username text primary key,

  /*
   * Who left it — the only account that may take it back.
   *
   * Q6, ACCOUNT DELETION: ON DELETE CASCADE, so the hold dies with the person.
   * The hold exists so a SPECIFIC person can change their mind. When that
   * person no longer exists there is nobody to change their mind, and the row
   * stops being a reservation and becomes a pure denial — a handle held for a
   * ghost, refused to everybody, for a fortnight, to protect nothing.
   *
   * The argument that settles it: deleting and re-registering does not help
   * them either. A new signup is a new `auth.users` id, so the returning
   * person is a stranger to their own hold and would be refused by the rule
   * below even if the row survived. Keeping it could not return the handle to
   * anybody — it could only withhold it from everybody.
   *
   * It is also the consistent reading of deletion elsewhere here: `profiles`
   * cascades from `auth.users`, so deleting the account already frees the
   * handle the person was actively USING, instantly. A held handle outliving
   * the account while the live one does not would be the odd rule.
   */
  released_by uuid not null references public.profiles (id) on delete cascade,

  released_at timestamptz not null default now(),

  /* Stored, and the authority. Never `released_at + window` at read time. */
  hold_expires_at timestamptz not null,

  constraint username_releases_window_forward check (hold_expires_at > released_at)
);

/* For `my_username_holds()` and for the foreign key — this schema indexes its
   FKs deliberately (20260829200000). */
create index if not exists username_releases_holder_idx
  on public.username_releases (released_by, hold_expires_at desc);

alter table public.username_releases enable row level security;

/*
 * OWNER AND STAFF ONLY, and this is a privacy decision rather than tidiness.
 *
 * A readable release table is a handle HISTORY: "@alex used to be @sarah_k".
 * That single join undoes the main reason a person changes a handle in the
 * first place — being found by whoever knew the old one. So the row is
 * readable by the person it belongs to (they need the countdown) and by staff
 * (they need it for impersonation reports), and by nobody else.
 *
 * What a stranger CAN learn is narrower and deliberate: the `held` refusal
 * tells them a handle was recently released and when it frees up. It never
 * says by whom. That disclosure is the price of a refusal somebody can act on
 * — the alternative is telling them "taken" about a handle nobody holds, which
 * is a false sentence that makes them retry forever.
 */
drop policy if exists username_releases_select on public.username_releases;
create policy username_releases_select on public.username_releases
  for select to authenticated
  using (released_by = (select auth.uid()) or public.is_staff());

/* No write policy and no write grant, on purpose: the only writer is
   `claim_username()`, which is SECURITY DEFINER and bypasses both. A DELETE
   grant here would let somebody drop their own hold — harmless — but also
   makes the table look like something the client may edit, and the next
   feature would edit it. */
grant select on public.username_releases to authenticated;
revoke insert, update, delete on public.username_releases from authenticated, anon;

comment on table public.username_releases is
  'A handle somebody walked away from, held for username_hold_window() so only '
  'they can take it back. Readable by its owner and staff ONLY — a public release '
  'log is a handle history, which is exactly what changing a handle is meant to '
  'break. Written only by claim_username().';

/* ==========================================================================
 * 3. THE RULE — written once, so it cannot be written twice differently
 * ========================================================================== */

/*
 * MAY THIS PERSON TAKE THIS HANDLE. Every path that asks reads this function:
 * `claim_username`, `username_available`, and `username_suggestions`. Three
 * copies of one rule is three chances for the availability check to say yes to
 * something the claim refuses — or, in the direction that actually costs
 * somebody their handle, for the claim to allow what the check would have
 * denied.
 *
 * Three answers, and the caller is part of the question:
 *
 *   'free'   no live hold. Ordinary rules apply.
 *   'yours'  a live hold, and `who` is the person who released it.
 *   'held'   a live hold, and `who` is anybody else — including nobody at all.
 *
 * FAIL CLOSED ON A NULL CALLER. `who is not null and r.released_by = who`
 * rather than an equality that a NULL would quietly make unknown: an
 * unauthenticated or unidentified caller must land on 'held', never on
 * 'yours'.
 *
 * EXPIRY IS THE TEST, NOT EXISTENCE. Nothing anywhere may ask whether a row
 * exists for a handle. A row whose `hold_expires_at` has passed is not a hold,
 * and treating it as one would quietly reserve handles forever (see Q4 — those
 * rows are not swept, so there will be plenty of them).
 */
create or replace function public.username_hold_state(candidate text, who uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when who is not null and r.released_by = who then 'yours'
                 else 'held'
            end
       from public.username_releases r
      where r.username = lower(btrim(coalesce(candidate, '')))
        and r.hold_expires_at > now()),
    'free');
$$;

comment on function public.username_hold_state(text, uuid) is
  'THE rule: free / yours / held. Consulted by claim_username, username_available '
  'and username_suggestions so the three can never disagree about who may take a '
  'released handle.';

/* When the hold ends — for the refusal sentence and the countdown. NULL when
   there is no live hold, which is a measured "no hold", not a missing value. */
create or replace function public.username_hold_until(candidate text)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.hold_expires_at
    from public.username_releases r
   where r.username = lower(btrim(coalesce(candidate, '')))
     and r.hold_expires_at > now();
$$;

/*
 * Neither is granted to anybody. Both are called from inside SECURITY DEFINER
 * functions, where the current user is the owner and EXECUTE comes with
 * ownership. Revoked from `anon, authenticated` BY NAME rather than from
 * `public` alone: default privileges grant EXECUTE to PUBLIC and anon inherits
 * it, a trap this schema has been bitten by before.
 */
revoke all on function public.username_hold_state(text, uuid) from public, anon, authenticated;
revoke all on function public.username_hold_until(text) from public, anon, authenticated;
revoke all on function public.username_hold_window() from public, anon;
grant execute on function public.username_hold_window() to authenticated;

/* ==========================================================================
 * 4. SUGGESTIONS MUST NOT OFFER WHAT THE CLAIM WILL REFUSE
 * ========================================================================== */

/*
 * Unchanged except for one clause. A suggestion is a button somebody presses;
 * offering one that comes back refused is worse than offering nothing, and it
 * is the exact drift the shared rule exists to prevent.
 *
 * `in ('free','yours')` rather than `<> 'held'` — the fail-closed direction. A
 * handle held BY THE CALLER is still a fine suggestion; anything the rule does
 * not positively call claimable is left out.
 */
create or replace function public.username_suggestions(base text)
returns text[]
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  root text := left(regexp_replace(lower(btrim(coalesce(base,''))), '[^a-z0-9]', '', 'g'), 14);
  out text[] := '{}';
  cand text;
  n int := 0;
  v_uid uuid := (select auth.uid());
begin
  if length(root) < 2 then root := 'climber'; end if;
  for cand in
    select c from unnest(array[
      root || '1', root || '.climbs', root || '_ice', root || '2',
      root || '.alp', root || '3', root || '_summit'
    ]) as c
  loop
    exit when n >= 3;
    if public.username_format_ok(cand)
       and not exists (select 1 from public.profiles p where p.username = cand)
       and not exists (select 1 from public.reserved_usernames r where r.name = cand)
       and public.username_hold_state(cand, v_uid) in ('free', 'yours')
    then
      out := out || cand; n := n + 1;
    end if;
  end loop;
  return out;
end;
$$;

/* ==========================================================================
 * 5. AVAILABILITY — the same answer the claim would give, to THIS caller
 * ========================================================================== */

/*
 * STILL ADVISORY, AND NOW CALLER-DEPENDENT. That second part is new and worth
 * stating loudly, because it was not true before this file: `username_available`
 * used to be a pure function of the candidate, and two people asking about
 * `@alpine` got the same answer by construction. They no longer do. Inside a
 * hold window the same handle is `ok: true` to the person who released it and
 * `held` to everybody else.
 *
 * Consequences, both of which are real:
 *   · IT MUST NEVER BE CACHED ACROSS ACCOUNTS. Any shared cache keyed on the
 *     candidate alone will hand one person another person's answer — which in
 *     the wrong direction tells a stranger a held handle is theirs to take.
 *   · IT IS STILL STALE THE INSTANT IT RETURNS. `claim_username` decides.
 *
 * ORDER MATTERS AND IS DELIBERATE.
 *
 *   format → reserved → taken → held
 *
 * Q5, RESERVED vs A RELEASED HANDLE: RESERVED WINS, and it wins because it is
 * asked first. `reserved_usernames` exists to stop impersonation ('support',
 * 'security') and to stop a handle shadowing a route ('p', 'settings'); those
 * reasons do not care who held the name before. So if `sherpa` is added to the
 * list after somebody releases it, its previous holder is refused too — they
 * get `reserved`, which is the true sentence. The reverse order would let a
 * reclaim reinstate a handle the platform has since decided nobody may hold.
 *
 * Note the one asymmetry, which is pre-existing and correct: somebody already
 * HOLDING a name that is reserved later keeps it. No constraint evicts them,
 * because the reserved list is enforced at claim time only. They simply cannot
 * get it back once they let it go.
 *
 * `taken` before `held` because a handle that is both owned and held cannot
 * arise from this code — the claim deletes the hold — but an admin moving a
 * handle by hand could produce it, and in that case the person actually
 * wearing it is the truer answer.
 */
create or replace function public.username_available(candidate text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c      text := lower(btrim(coalesce(candidate, '')));
  v_uid  uuid := (select auth.uid());
  v_hold text;
begin
  if not public.username_format_ok(c) then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = c) then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  if exists (select 1 from public.profiles p where p.username = c) then
    return jsonb_build_object('ok', false, 'reason', 'taken',
                              'suggestions', public.username_suggestions(c));
  end if;

  v_hold := public.username_hold_state(c, v_uid);
  if v_hold = 'yours' then
    /* Available, and the UI can say WHY it is available, from a stored
       timestamp rather than an assumption about when they left. */
    return jsonb_build_object('ok', true, 'reclaim', true,
                              'reclaim_until', public.username_hold_until(c));
  end if;
  if v_hold <> 'free' then
    return jsonb_build_object('ok', false, 'reason', 'held',
                              'held_until', public.username_hold_until(c),
                              'suggestions', public.username_suggestions(c));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

/* ==========================================================================
 * 6. THE CLAIM — the only call that decides
 * ========================================================================== */

/*
 * THE CONTRACT IS PRESERVED. `{ok, reason, username, suggestions}`, and every
 * reason code that existed still means what it meant: `format`, `reserved`,
 * `taken`. `icefall-app/src/auth/username.ts` switches on those strings today
 * and must keep working unchanged. Two codes are ADDED — `held` and
 * `not_saved` — and two keys — `held_until`, `reclaim` — which older callers
 * ignore. The app currently funnels unknown reasons into `format`; until it is
 * taught the new ones, a held handle reads as a formatting complaint. That is
 * a UI wiring job, noted rather than done here.
 *
 * WHY `held` IS NOT `taken`. They describe different worlds and deserve
 * different sentences. `taken` means somebody is wearing it; the answer is
 * pick another name. `held` means nobody is wearing it, one specific person
 * may take it back, and on a date this function can state it becomes ordinary.
 * Collapsing them would tell somebody a handle is gone forever when in fact it
 * frees up on Tuesday.
 *
 * `held_until` IS NULLABLE AND THE UI MUST TOLERATE THAT. It is read a moment
 * after the refusal is decided, and a hold that lapsed in between yields null.
 * Null means "held, and this call cannot say until when" — the sentence drops
 * the date. It never becomes a computed date, because a date this function did
 * not read is a date nothing verified.
 *
 * ── Q1: A → B, BACK TO A ON DAY 3, THEN TO C ON DAY 5 ──────────────────────
 *
 *   day 0  leaves A for B     → hold on A until day 14, held by them
 *   day 3  takes A back       → the hold on A is DELETED. A hold on B opens,
 *                               until day 17.
 *   day 5  leaves A for C     → a NEW hold on A, until day 19. B's hold is
 *                               untouched and still ends on day 17.
 *
 * So on day 5 that person holds C outright and has live holds on both A and B.
 * A is held again with a FRESH fourteen days, not the remainder of the first
 * window.
 *
 * That is the correct behaviour, and the reason is that a hold is a promise
 * about a departure, not a budget attached to a name. On day 5 they genuinely
 * did just leave A; the fortnight starts then. Resuming the original clock
 * would mean somebody who reclaimed their handle for ten minutes on day 13 and
 * left again got one day of protection, and it would require keeping consumed
 * releases and summing them — a second, subtler model, storing the history the
 * privacy note above is at pains not to keep.
 *
 * The honest cost of that choice is Q2.
 *
 * ── Q2: THE SQUAT. A → B → A → B, FOREVER ─────────────────────────────────
 *
 * YES. THIS DESIGN ALLOWS IT, and saying otherwise would be the comment this
 * project forbids. One handle change every thirteen days keeps two handles
 * indefinitely: the one being worn and the one on hold, each swap re-arming a
 * fresh fourteen days on the one just left. Nothing in this file stops it,
 * and the hold is not a squatting defence — it is a mind-changing window that
 * a squatter can also use.
 *
 * WHAT WOULD STOP IT, none of which is implemented because none of it was
 * asked for and each is a product decision with its own cost:
 *   · a rate limit on changes (one per 30 days) — the obvious fix, and it
 *     punishes the ordinary case of typing your handle wrong and fixing it an
 *     hour later;
 *   · a cap of one live hold per profile, so the second change forfeits the
 *     first hold;
 *   · charging the window against the handle rather than the departure, i.e.
 *     the resumed clock rejected in Q1.
 *
 * WHAT IS TRUE TODAY: the squat is VISIBLE. Every release is a row with a who
 * and a when, and staff can read them —
 *     select released_by, count(*) from public.username_releases
 *      group by 1 having count(*) > 1;
 * Visible is not prevented, and this comment does not claim it is.
 *
 * ── Q3: TWO PEOPLE RACE THE INSTANT A HOLD EXPIRES ────────────────────────
 *
 * First come, first served, and `profiles_username_key` — not this function —
 * is what actually decides. The check-then-act here is NOT atomic: both
 * callers can read 'free' microseconds after expiry. Only one UPDATE can put
 * that string in the unique index; the loser raises 23505, is caught below,
 * and reads `taken`. That path is unchanged from the original file and is
 * still the arbiter. The previous holder gets no advantage after expiry, which
 * is the whole meaning of the window ending.
 *
 * THE HARDER RACE, AND THE REASON FOR THE RE-CHECK AFTER THE WRITE. Consider a
 * stranger claiming @alex at the exact moment @alex's owner is leaving it:
 *
 *   1. the stranger's hold check runs before the release row is committed and
 *      reads 'free' — correctly, at that instant;
 *   2. their UPDATE blocks on the unique index, because the owner still holds
 *      @alex in `profiles`;
 *   3. the owner commits: @alex is vacated AND the hold appears, in the same
 *      transaction;
 *   4. the stranger's UPDATE unblocks and SUCCEEDS — the handle is free now.
 *
 * Without step 5 the stranger walks straight through a live hold. So the hold
 * is asked again AFTER the write, in the same transaction: under READ
 * COMMITTED each statement takes a fresh snapshot, and the wait in (2)
 * guarantees the release row is visible by then. If a hold has appeared, the
 * inner block raises, which rolls back to the block's implicit savepoint and
 * undoes the UPDATE, and the caller reads `held`.
 *
 * That re-check is written `is distinct from 'free'` — the fail-closed form —
 * while the EARLY check is written `= 'held'`. The asymmetry is deliberate:
 * the early one exists to produce a good message and may be wrong in either
 * direction without consequence; the late one is the one that decides, and a
 * NULL from it must close the gate, not open it.
 *
 * The release-side has no window of its own to defend, because the release
 * INSERT and the profile UPDATE are in a single transaction. There is no
 * instant at which a handle is vacant in `profiles` and unheld in
 * `username_releases`.
 *
 * ── Q4: WHAT DELETES EXPIRED RELEASES ─────────────────────────────────────
 *
 * NOTHING SCHEDULED. There is no sweeper, no cron and no trigger, and this is
 * a choice rather than an omission.
 *
 * Rows are deleted opportunistically: claiming a handle deletes its release
 * row, whoever claims it and whether the hold was theirs or merely expired.
 * What is left behind is rows for handles nobody ever asks for again — and
 * those cost nothing, because every read is a primary-key equality lookup plus
 * a timestamp comparison. The plan does not change at ten rows or ten million,
 * and the table grows by one row per handle CHANGE, which is a rare act.
 *
 * SO: A TABLE THAT ONLY GROWS, WITH A QUERY THAT STAYS CHEAP. Nothing breaks
 * if it is never swept — as long as no code ever asks whether a row EXISTS
 * instead of whether it is live, which is why the rule is one function and why
 * that function tests `hold_expires_at > now()` and nothing else.
 *
 * If space is ever wanted back, it is one statement and it is safe to run at
 * any time, because an expired row means nothing to any reader:
 *     delete from public.username_releases where hold_expires_at <= now();
 */
create or replace function public.claim_username(candidate text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c       text := lower(btrim(coalesce(candidate, '')));
  v_uid   uuid := (select auth.uid());
  v_old   text;
  v_saved text;
  v_fail  text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not public.username_format_ok(c) then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  if exists (select 1 from public.reserved_usernames r where r.name = c) then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;

  /* Courtesy check — a good message, cheaply, before touching anything. The
     one that DECIDES is inside the block below, after the write. */
  if public.username_hold_state(c, v_uid) = 'held' then
    return jsonb_build_object('ok', false, 'reason', 'held',
                              'held_until', public.username_hold_until(c),
                              'suggestions', public.username_suggestions(c));
  end if;

  /* Read BEFORE the write: this is the handle being left, and the whole
     feature is that it does not simply evaporate. */
  select p.username into v_old from public.profiles p where p.id = v_uid;

  begin
    /* The hold on the handle being TAKEN ends here, whether it was this
       person's to reclaim or had simply expired. Deleting it before the write
       is what lets the re-check below expect 'free' and nothing else. */
    delete from public.username_releases where username = c;

    /*
     * READ BACK WHAT WAS WRITTEN. The original returned ok on a `update ...
     * where id = auth.uid()` that matched ZERO rows — which happens for a
     * session whose profile row is missing, a case this schema has already had
     * once (20260902190000). It reported a handle the person did not get.
     * `returning ... into` is the row count and the read-back in one.
     */
    update public.profiles set username = c
     where id = v_uid
     returning username into v_saved;

    if v_saved is distinct from c then
      raise exception using errcode = 'ICE02', message = 'username not saved';
    end if;

    /* Q3, the decisive check. Fail closed. */
    if public.username_hold_state(c, v_uid) is distinct from 'free' then
      raise exception using errcode = 'ICE01', message = 'handle is held';
    end if;

    /*
     * THE RELEASE. Same transaction as the vacancy it creates, so there is no
     * instant at which the old handle is free and unheld.
     *
     * The upsert is guarded rather than unconditional. Normally no row can
     * exist for a handle its owner is still wearing — claiming it deleted any
     * — but `profiles_update_self` lets an admin move a handle directly,
     * bypassing that delete, so a live hold belonging to SOMEBODY ELSE is not
     * quite impossible. The WHERE refuses to overwrite one. Silently leaving
     * that stranger's hold standing is the fail-closed outcome.
     */
    if v_old is not null and v_old is distinct from c then
      insert into public.username_releases as ur
             (username, released_by, released_at, hold_expires_at)
      values (v_old, v_uid, now(), now() + public.username_hold_window())
      on conflict (username) do update
         set released_by     = excluded.released_by,
             released_at     = excluded.released_at,
             hold_expires_at = excluded.hold_expires_at
       where ur.released_by = excluded.released_by
          or ur.hold_expires_at <= now();
    end if;

  exception
    /* 23505 can only come from `profiles_username_key`: the insert above
       carries ON CONFLICT, and the delete cannot raise it. Catching a typed
       reason rather than letting it raise is the original design and the
       reason the screen never parses a Postgres error string. */
    when unique_violation then v_fail := 'taken';
    when sqlstate 'ICE01' then v_fail := 'held';
    when sqlstate 'ICE02' then v_fail := 'not_saved';
  end;

  if v_fail = 'taken' then
    return jsonb_build_object('ok', false, 'reason', 'taken',
                              'suggestions', public.username_suggestions(c));
  elsif v_fail = 'held' then
    return jsonb_build_object('ok', false, 'reason', 'held',
                              'held_until', public.username_hold_until(c),
                              'suggestions', public.username_suggestions(c));
  elsif v_fail is not null then
    /* `not_saved`. Nothing was stored and nothing is claimed to have been. */
    return jsonb_build_object('ok', false, 'reason', v_fail);
  end if;

  return jsonb_build_object('ok', true, 'username', c);
end;
$$;

comment on function public.claim_username(text) is
  'The only call that changes a handle. Records the release of the old one, holds '
  'it for username_hold_window() for its previous holder only, and refuses a held '
  'handle with reason=held (distinct from taken: nobody is wearing it, and it frees '
  'up on a stated date). Reasons: format, reserved, taken, held, not_saved.';

/* ==========================================================================
 * 7. THE COUNTDOWN — a real timestamp, or nothing
 * ========================================================================== */

/*
 * So the UI can say "@oldname is yours until 17 September" and mean it.
 *
 * `hold_expires_at` is stored and is the same value the claim path enforces —
 * there is no second calculation here that could disagree with it, and no
 * guess about when the person changed their handle.
 *
 * `server_now` is returned alongside it because a countdown drawn against the
 * DEVICE clock is a countdown against an unverified number: a phone an hour
 * fast shows an hour less than the person actually has, and one an hour slow
 * offers time that does not exist. With both values the app computes an offset
 * once and counts down honestly.
 *
 * LIVE HOLDS ONLY. An expired release is not a hold, and listing it would put
 * "take @oldname back" in front of somebody the claim would refuse.
 *
 * NO ROWS IS THE ANSWER "you have no handle waiting", and it is a measured
 * emptiness — the query ran and found none. It renders as nothing at all: no
 * zero, no em dash. There is no unmeasured case here to reserve a dash for.
 */
create or replace function public.my_username_holds()
returns table (
  username        text,
  released_at     timestamptz,
  hold_expires_at timestamptz,
  server_now      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.username, r.released_at, r.hold_expires_at, now()
    from public.username_releases r
   where r.released_by = (select auth.uid())
     and r.hold_expires_at > now()
   order by r.hold_expires_at;
$$;

comment on function public.my_username_holds() is
  'Handles this person released that they can still take back, with the stored '
  'expiry and the server clock so the countdown never depends on the device clock. '
  'Live holds only. No rows means none waiting.';

/* ==========================================================================
 * 8. GRANTS — a policy permits; a grant makes the privilege exist
 * ========================================================================== */

/*
 * Revoked from `anon, authenticated` BY NAME, never from `public` alone:
 * default privileges grant EXECUTE to PUBLIC and anon inherits it.
 *
 * `username_format_ok` keeps its anon grant from 20260830100000 — it reads
 * nothing and answers a question about a string. Everything that touches the
 * release table stays behind a session.
 */
revoke all on function public.username_available(text) from public, anon;
revoke all on function public.claim_username(text) from public, anon;
revoke all on function public.username_suggestions(text) from public, anon, authenticated;
revoke all on function public.my_username_holds() from public, anon;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.my_username_holds() to authenticated;

notify pgrst, 'reload schema';
