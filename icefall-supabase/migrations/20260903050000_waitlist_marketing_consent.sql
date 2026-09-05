/* ==========================================================================
 * ICEFALL — marketing consent on the pre-launch waitlist, stored WITH the
 * evidence that makes it a consent rather than a claim.
 *
 * WHAT THIS FILE DOES. `public.waitlist` was an email address, a name, a
 * source and a timestamp. This adds a separate, optional, unticked permission
 * to send marketing to that address; a versioned home for the exact sentence
 * the person read; an append-only log of every consent decision including
 * withdrawal; and one admin-only reader that returns COUNTS and never the list.
 *
 * WHY IT COULD NOT BE A COLUMN AND A TICK. Joining a waitlist is a request to
 * be told when something opens. It is not permission to send promotions. Those
 * are two purposes, consent to the second has to be specific and unbundled,
 * and — the part a boolean cannot do — it has to be EVIDENCED: who agreed,
 * when, to which words, by what route, and whether they have since withdrawn.
 * A bare `true` says somebody agreed and not what to, and the copy on the page
 * will change.
 *
 * ── THE WINDOW, AND THAT IT CLOSES ────────────────────────────────────────
 *
 * `select count(*) from public.waitlist` was 0 when this was written. Nobody
 * had signed up, so nothing had been collected without consent, no backfill
 * exists and every column added here can be strict from its first row. That is
 * the only reason this file is a clean addition rather than a cleanup.
 *
 * IT STOPS BEING FIXABLE ON THE FIRST SIGNUP. You cannot email somebody to ask
 * whether they consent to being emailed. Every address collected before these
 * columns exist is an address marketing can never lawfully use, and no later
 * migration invents the permission. So this file goes out before the signup
 * form is put in front of anybody — not after.
 *
 * ── THE CONSTRAINT THE OWNER CHOSE, WRITTEN HERE AS A LIVE CONSTRAINT ─────
 *
 * The wording seeded below was authored by the owner and CHOSEN OVER A WIDER
 * VARIANT that added "…plus offers from expedition companies on ICEFALL". That
 * variant was put to them precisely because it would have let ICEFALL run
 * partner promotions later without going back and asking everybody again. They
 * read it and declined it.
 *
 * SO, AS A RULE AND NOT A FOOTNOTE: this list may be emailed about ICEFALL. It
 * MAY NOT be emailed on behalf of an expedition company, a guide, or any other
 * third party. The day somebody wants to send an operator's offer to these
 * addresses, that is a purpose these people did not agree to, and the only
 * lawful route is fresh consent from each of them — a new purpose in
 * `waitlist_consent_purposes`, a new wording, and a new decision per person.
 * Adding the purpose row is NOT the consent; it is the place to put it. A
 * future session reading only the seeded sentence would have no way to know the
 * broader version existed and was refused, and would reasonably assume nobody
 * had thought about it. Somebody did, and the answer was no.
 *
 * A PRE-TICKED BOX was also raised and declined. It was raised only so it could
 * be named: consent that is on by default is not freely given and is not
 * consent. The box on the form defaults to false and the column defaults to
 * nothing at all.
 *
 * ── ORDER, AND WHAT BREAKS IF IT IS WRONG ─────────────────────────────────
 *
 * AFTER 20260825120000_waitlist.sql, which creates `public.waitlist`. Applied
 * before it, the first `alter table public.waitlist` here fails 42P01 and the
 * whole file rolls back — loudly, harmlessly, and with nothing half-applied,
 * because Supabase runs each migration file in one transaction.
 *
 * It depends on NOTHING in 20260903040000_gender_and_heard_about.sql, the other
 * file pending against the live database. The two go out in the same push
 * because there is no per-file push, not because either needs the other. They
 * touch different tables and can be applied in either order.
 *
 * BEFORE THE WEB DEPLOY OR WITH IT, NEVER AFTER. `icefall-web/api/_waitlist.mjs`
 * already posts `marketing_consent`, `marketing_consent_at` and
 * `marketing_consent_text`. Until this file is applied those columns do not
 * exist, PostgREST answers PGRST204, `insertSupabase` throws, and the visitor
 * is told the signup failed — so the address is not silently lost, but nobody
 * gets on the list either. The safe order is: apply this, then deploy the site.
 *
 * ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────
 *
 * It does not send anything, and it does not build the unsubscribe link the
 * seeded sentence promises. Section 8 says so in full. Nothing may be emailed
 * to this list until that link exists.
 * ========================================================================== */


/* ========================================================================== */
/* 1. THE PURPOSES — because "consent" is not one thing                       */
/* ========================================================================== */

/*
 * ── WHY A VOCABULARY OF PURPOSES AND NOT A SECOND BOOLEAN ─────────────────
 *
 * "Tell me when it opens" and "send me promotions" are two permissions. One
 * boolean covering both is not specific consent NO MATTER HOW THE BOX IS
 * WORDED, because the shape of the column decides whether the two can ever be
 * told apart afterwards — and if they cannot, then every later question
 * ("how many people actually agreed to marketing?", "did this person withdraw
 * from promotions or from everything?") has no answer in the data.
 *
 * Two booleans would separate today's two purposes and would have to be a
 * migration and a new reader for the third. A purpose per ROW costs one table
 * and makes the separation structural: a decision in this system is always
 * ABOUT a named purpose, so no future code path can record a consent that
 * quietly spans two.
 *
 * ── WHY `launch-notice` IS IN HERE AT ALL ─────────────────────────────────
 *
 * Because leaving it out is what creates the bundling. If the only purpose in
 * the system is `marketing`, then "we may email you at launch" is an unwritten
 * assumption living in a table comment, and unwritten assumptions get merged
 * into whichever permission IS written down. Naming it makes it a thing that
 * can be counted, reported on, and — the point — WITHDRAWN separately. Somebody
 * may want the launch email and no promotions, or promotions and no launch
 * email, and both are now expressible.
 *
 * ITS EVIDENCE IS DIFFERENT AND THE DIFFERENCE IS RECORDED, NOT SMOOTHED OVER.
 * Nobody read a sentence to get the launch notice; they typed their address
 * into a form headed with what the form was for and pressed the button. That is
 * why `needs_wording` exists and why it is false for this purpose: the evidence
 * is the submission itself, and a `wording` of NULL on those events means "no
 * sentence was shown", not "we lost it". Inventing a sentence to fill the
 * column would be manufacturing evidence, which is the exact failure this whole
 * file is built to prevent.
 *
 * ── THE ROW THAT IS DELIBERATELY NOT HERE ─────────────────────────────────
 *
 * `partner-offers`. See the header. It is absent because the owner declined the
 * wording that would have covered it, and it must stay absent until somebody
 * has actually been asked. If a future session adds it: adding the row grants
 * nothing. Every person needs a `granted` event of their own, from a form they
 * saw, or they are not in that audience.
 */
create table if not exists public.waitlist_consent_purposes (
  slug text primary key
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),

  /* The words a report is labelled with. Short, and for ICEFALL's own eyes. */
  label text not null check (length(btrim(label)) between 1 and 60),

  /*
   * What sending under this purpose actually means, in a sentence. This is the
   * field a future session reads before deciding whether their campaign fits an
   * existing purpose or needs a new one, so it describes the LIMIT, not the
   * intent.
   */
  description text not null check (length(btrim(description)) between 1 and 400),

  /*
   * WHETHER A GRANT FOR THIS PURPOSE REQUIRES THE SENTENCE THAT WAS SHOWN.
   *
   * True for anything presented as a tick box: the box is meaningless without
   * its label, so a grant with no wording is not evidence of anything and is
   * refused by `waitlist_consent_event_freeze` below. False for a purpose whose
   * evidence is the act itself. It is stored rather than assumed because the
   * enforcement is one trigger and the trigger needs to know which kind it is
   * looking at; a convention in a comment would be enforced by nothing.
   */
  needs_wording boolean not null default true,

  sort_order integer not null default 100,

  /*
   * RETIRED means "stop offering it", never "delete it". Decisions people
   * already made are protected by the foreign key from the event log, which
   * REFUSES the delete rather than merely discouraging it.
   */
  retired boolean not null default false
);

insert into public.waitlist_consent_purposes (slug, label, description, needs_wording, sort_order) values
  ('launch-notice',
   'Launch announcement',
   'One email when ICEFALL opens, which is the thing the person asked for by joining the waitlist. Evidence is the signup itself, not a sentence they read, so no wording is stored against it.',
   false,
   10),
  ('marketing',
   'ICEFALL news and offers',
   'Occasional email about ICEFALL itself. Requires the separate unticked box on the signup form. DOES NOT COVER sending on behalf of expedition companies or any other third party - the owner was offered that wording and declined it, so partner promotion needs a new purpose and fresh consent from each person.',
   true,
   20)
on conflict (slug) do nothing;

/*
 * `on conflict do nothing`, never `do update` — the same rule
 * `heard_about_channels` gives one file over. If somebody has retired a purpose
 * or corrected a description on the live database, re-running this migration
 * must not silently undo that decision.
 */

comment on table public.waitlist_consent_purposes is
  'The things ICEFALL may ask permission to email a waitlist address about. One row per '
  'purpose because "consent" is not one thing: a single boolean over two purposes cannot '
  'be told apart afterwards, and cannot be withdrawn from separately. Adding a row here '
  'creates a PLACE to record consent - it does not create the consent, which only ever '
  'comes from a person being asked.';


/* ========================================================================== */
/* 2. THE WORDINGS — versioned, and immutable once used                       */
/* ========================================================================== */

/*
 * ── WHY A REFERENCE AND A FROZEN COPY, WHEN EITHER LOOKS SUFFICIENT ───────
 *
 * A foreign key to a versioned string is only as durable as the row it points
 * at. Edit that row — fix a typo, soften a phrase, widen the scope — instead of
 * adding a new version, and every consent ever recorded silently re-points at
 * words nobody agreed to, while the audit trail still looks perfect. Nothing
 * about the data would show the change. That is the worst available failure:
 * not a missing record, a convincing false one.
 *
 * A frozen copy alone loses the other half. Text on a row groups on nothing, so
 * "how many people are on the current wording" becomes a string comparison, and
 * the day a stray space creeps in it becomes a wrong answer that renders fine.
 *
 * So BOTH, and they defend different things:
 *   · the VERSION is the handle a report groups and joins on;
 *   · the frozen COPY is what a person is shown if they ever ask what they
 *     agreed to, and it survives even if this whole table is dropped.
 *
 * AND THE ROW IS MADE IMMUTABLE ANYWAY (see the guard below), because "both"
 * only works if the copy and the reference cannot disagree. Belt and braces on
 * purpose, exactly as 20260825120000 did with the read privileges.
 */
create table if not exists public.waitlist_consent_wordings (
  /*
   * The handle. Slug rather than a serial so it is readable in a report and in
   * a URL, and so the purpose it belongs to is visible without a join.
   */
  version text primary key
    check (version ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(version) between 3 and 60),

  purpose text not null references public.waitlist_consent_purposes (slug)
    on update cascade
    on delete restrict,

  /*
   * THE EXACT SENTENCE THAT WAS ON SCREEN. Byte for byte, including the full
   * stop. It is compared for exact equality against what the client says it
   * displayed (section 4), so a change of punctuation here is a change of
   * version, not an edit.
   */
  wording text not null check (length(btrim(wording)) between 10 and 500),

  /*
   * WHICH WORDING IS CURRENTLY ON THE PAGE. At most one per purpose, enforced
   * by the partial unique index below. Retiring a wording is setting this
   * false; it is the one field on this table that is meant to change, because
   * it describes the PRESENT and not the past.
   */
  in_force boolean not null default false,

  authored_on date not null default current_date,

  /*
   * Why this version exists and what changed from the last one. Read this
   * before writing a new version; a wording history with no reasons is a list
   * of sentences nobody can account for.
   */
  notes text check (notes is null or length(btrim(notes)) between 1 and 1000)
);

/*
 * ONE IN FORCE PER PURPOSE, and none is also legal — a purpose can exist with
 * every wording retired, which correctly means "we are not asking this at the
 * moment". A partial unique index rather than a CHECK, because the rule spans
 * rows.
 */
create unique index if not exists waitlist_consent_wordings_one_in_force
  on public.waitlist_consent_wordings (purpose)
  where in_force;

/* The FK index. 20260829200000 indexed every foreign key in the schema and gave
 * the reason: Postgres indexes a primary key automatically and a foreign key
 * not at all, and `on delete restrict` scans the child table purely to decide
 * whether to raise. This FK is one more of exactly that kind. */
create index if not exists idx_waitlist_consent_wordings_purpose
  on public.waitlist_consent_wordings (purpose);

/*
 * ── THE OWNER'S SENTENCE, SEEDED VERBATIM ─────────────────────────────────
 *
 * This string is the same bytes as `MARKETING_CONSENT_TEXT` in
 * `icefall-web/src/lib/waitlist.ts`, which is both rendered beside the checkbox
 * and sent with the signup. The equality is not decorative: section 4 refuses
 * any consent whose displayed sentence is not found in this table, so the two
 * cannot drift without signups failing loudly. That is the intended behaviour
 * and it is the safe direction to fail in — a signup that errors is recoverable,
 * a consent record describing words nobody saw is not.
 *
 * IF YOU ARE HERE TO CHANGE THE COPY: add a NEW row with a new version, set the
 * old row `in_force = false` and the new one true, and ship the migration
 * BEFORE the web deploy that changes the sentence. Editing the row below is
 * refused by `waitlist_consent_wordings_immutable`, and editing the string in
 * `waitlist.ts` without adding a row here stops every consenting signup until
 * one exists.
 */
insert into public.waitlist_consent_wordings (version, purpose, wording, in_force, notes) values
  ('marketing-v1',
   'marketing',
   'Email me occasional ICEFALL news and offers. Unsubscribe any time.',
   true,
   'The first wording, authored by the owner. Chosen over a wider variant ending "...plus offers from expedition companies on ICEFALL", which was offered specifically so partner promotions would not need re-consent later, and was declined. This wording therefore covers ICEFALL''s own email and nothing sent on behalf of a third party.')
on conflict (version) do nothing;

/*
 * ── IMMUTABLE ONCE WRITTEN ────────────────────────────────────────────────
 *
 * `version`, `purpose` and `wording` cannot be changed and no row can be
 * deleted. Everything else can, because `in_force` and `notes` describe the
 * present rather than what somebody agreed to.
 *
 * This is enforced against ROLES NO POLICY GOVERNS. RLS does not apply to the
 * table owner or to `service_role`, and the dashboard SQL editor is exactly
 * where a well-meaning typo fix would be made. A trigger applies to all of
 * them, which is why the rule lives here and not in a policy.
 */
create or replace function public.waitlist_consent_wordings_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a consent wording cannot be deleted (version %)', old.version
      using hint = 'People agreed to these words. Deleting the row would leave their consent pointing at nothing, or cascade the fact away entirely. Set in_force = false to take it off the page.';
  end if;

  if new.version is distinct from old.version
     or new.purpose is distinct from old.purpose
     or new.wording is distinct from old.wording then
    raise exception 'the words somebody agreed to cannot be edited (version %)', old.version
      using hint = 'Editing this row would silently re-point every past consent at wording nobody was shown, and the audit trail would still look intact. Insert a NEW version, set this one in_force = false, and ship it before the copy change.';
  end if;

  return new;
end;
$$;

drop trigger if exists waitlist_consent_wordings_immutable on public.waitlist_consent_wordings;
create trigger waitlist_consent_wordings_immutable
  before update or delete on public.waitlist_consent_wordings
  for each row execute function public.waitlist_consent_wordings_immutable();

comment on table public.waitlist_consent_wordings is
  'Every sentence ICEFALL has ever shown beside a consent box, one row per version. '
  'version/purpose/wording are immutable and rows cannot be deleted: editing them would '
  're-point past consents at words nobody agreed to while the audit trail still looked '
  'intact. in_force says which is on the page now, at most one per purpose. Changing the '
  'copy means a NEW row, shipped before the web deploy.';


/* ========================================================================== */
/* 3. THE COLUMNS ON `waitlist` — the signup decision, and only that          */
/* ========================================================================== */

/*
 * ── THREE STATES, WHICH IS WHY THE COLUMN IS NULLABLE AND HAS NO DEFAULT ──
 *
 *   true   granted     — they ticked an unticked box.
 *   false  declined    — they were shown the box and did not tick it.
 *   null   never asked — nobody put the question to them.
 *
 * `not null default false` would collapse the last two, and they are different
 * facts that license different actions: a person who was never asked MAY be
 * asked, and a person who declined MUST NOT be asked again as a matter of
 * course. Flatten them at the source and no later migration can recover which
 * a given `false` was, because the distinction was never written down. NULL is
 * doing real work here and is not an absence of care.
 *
 * Today's form always renders the box, so it always writes true or false and
 * never null. NULL exists for the write path nobody has thought of yet — an
 * import, a paper list, a second site — and it means that path must not be able
 * to pass silence off as a refusal.
 *
 * ── WHY THESE COLUMNS SURVIVE ALONGSIDE THE EVENT LOG ─────────────────────
 *
 * Section 5 is the history and is the source of truth for CURRENT state. These
 * four columns are the INTAKE — the shape `_waitlist.mjs` already posts, and
 * the record of what was decided AT SIGNUP specifically.
 *
 * They are not a cache and they cannot drift, because they are never updated:
 * `waitlist` has no UPDATE policy and no UPDATE privilege for anon or
 * authenticated, and section 7 adds a guard that refuses the update even from
 * roles no policy governs. So `marketing_consent` is permanently the answer to
 * "what did this person decide when they signed up", which stays true forever,
 * and is NEVER the answer to "may we email them today" — that question is
 * `waitlist_consent_tally()` and the log behind it. Anything that reads these
 * columns to decide whether to send is reading the wrong thing, which is why
 * the column comments say so.
 */
alter table public.waitlist
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_text text,
  add column if not exists marketing_consent_version text;

/*
 * The version reference. `on delete restrict` is belt to the immutability
 * trigger's braces: even if that trigger were dropped, the wording somebody
 * consented to could not be deleted out from under them.
 */
alter table public.waitlist drop constraint if exists waitlist_marketing_consent_version_known;
alter table public.waitlist add constraint waitlist_marketing_consent_version_known
  foreign key (marketing_consent_version) references public.waitlist_consent_wordings (version)
  on update cascade
  on delete restrict;

create index if not exists idx_waitlist_marketing_consent_version
  on public.waitlist (marketing_consent_version);

/*
 * ── CONSENT CANNOT EXIST WITHOUT ITS EVIDENCE ─────────────────────────────
 *
 * A row asserting `marketing_consent = true` with no timestamp, no wording and
 * no version is a claim nobody can substantiate, which is precisely what an
 * audit asks for and precisely what this table would otherwise be full of.
 *
 * The reverse direction matters as much and is the half that is easy to miss:
 * a row that is NOT a grant must carry no evidence at all. Evidence hanging off
 * a `false` or a `null` is a consent record for a consent that was refused or
 * never sought, and a later query filtering on "has a wording" would sweep
 * those people into the audience.
 *
 * Enforced here rather than in the API because the API is ONE caller and this
 * is the kind of claim that must not survive a careless second one. The name
 * `waitlist_consent_evidence` is referenced by a comment in
 * `icefall-web/api/_waitlist.mjs`; keeping it means that comment stays true.
 */
alter table public.waitlist drop constraint if exists waitlist_consent_evidence;
alter table public.waitlist add constraint waitlist_consent_evidence check (
  case
    when marketing_consent is true then
      marketing_consent_at is not null
      and marketing_consent_version is not null
      and marketing_consent_text is not null
      and char_length(btrim(marketing_consent_text)) between 10 and 500
    else
      marketing_consent_at is null
      and marketing_consent_version is null
      and marketing_consent_text is null
  end
);

comment on column public.waitlist.marketing_consent is
  'What this person decided ABOUT MARKETING WHEN THEY SIGNED UP. true = ticked an '
  'unticked-by-default box; false = shown it and declined; null = never asked. The three '
  'are separate on purpose: somebody never asked may be asked, somebody who declined may '
  'not. NOT THE CURRENT STATE - it is never updated, and a person who has since withdrawn '
  'still reads true here. To decide whether an address may be emailed today, use the '
  'event log in waitlist_consent_events, never this column. Joining the waitlist is not '
  'itself consent to marketing.';

comment on column public.waitlist.marketing_consent_at is
  'When the grant was recorded, set by the SERVER clock in waitlist_consent_intake and '
  'never by the client - a signer who could write this could date their own consent. '
  'Null unless marketing_consent is true; a decline has no separate moment, because it '
  'happened at created_at along with the rest of the submission.';

comment on column public.waitlist.marketing_consent_text is
  'The exact sentence shown beside the box, copied by the server from '
  'waitlist_consent_wordings rather than accepted from the client. Frozen: a later edit '
  'to the wordings table cannot reach it, and the wordings table refuses the edit anyway. '
  'Stored beside the version because a reference alone is only as durable as the row it '
  'points at.';

comment on column public.waitlist.marketing_consent_version is
  'Which version of the wording they were shown. The handle a report groups on; the '
  'frozen text beside it is what they actually read. Resolved by the server from the '
  'sentence the client says it displayed, so a client showing words this table has never '
  'heard of is refused rather than recorded.';


/* ========================================================================== */
/* 4. THE INSERT PATH — what an anonymous stranger can and cannot write       */
/* ========================================================================== */

/*
 * ── THE PROBLEM, WHICH IS §6ar WITH A TWIST ───────────────────────────────
 *
 * THE PERSON SIGNING UP WRITES THEIR OWN ROW, UNAUTHENTICATED, FROM THE PUBLIC
 * INTERNET. `_waitlist.mjs` runs on a server but reaches PostgREST with the
 * PUBLISHABLE key, which is shipped in the browser bundle; anybody can skip the
 * Vercel function entirely and POST straight at /rest/v1/waitlist with whatever
 * JSON they like. So "the API validates it" is not a control here. The API is
 * one caller among an unbounded number.
 *
 * §6ar is the class: wherever one party ASKS and another DECIDES, the asker
 * creates the row, so the asker's INSERT must not be able to write the
 * decision. It has already produced two live holes in this schema — self-
 * admission to a private group, and an anonymous visitor planting a forged
 * "answered by <named staff>" reply on the public enquiry form.
 *
 * CONSENT IS THE VARIANT WHERE THE ASKER GENUINELY IS THE DECIDER. The person
 * really is the one consenting, so `marketing_consent` itself is theirs to set
 * and must be. What is NOT theirs is the EVIDENCE. A client that can post
 * `marketing_consent_at: '2020-01-01'` and a `marketing_consent_text` of its
 * own choosing can manufacture a consent record for a consent that never
 * happened, and the audit trail would look immaculate. Worse, it is the shape
 * an attacker would use to make ICEFALL look like it had permission it did not
 * have — a fabricated compliance record is a liability, not a break-in.
 *
 * ── COLUMN GRANTS OR A TRIGGER: WHY THIS FILE USES BOTH, FOR DIFFERENT JOBS
 *
 * Column-level grants are the obvious tool and they cannot do this job alone.
 * `_waitlist.mjs` ALREADY SENDS `marketing_consent_at` and
 * `marketing_consent_text` in its POST body. Revoke anon's privilege on those
 * two columns and PostgREST answers 42501 and EVERY SIGNUP FAILS, including the
 * honest ones. The grant is a blunt yes/no on a column, and what is needed here
 * is "you may mention it, you do not get to decide it".
 *
 * A BEFORE INSERT trigger expresses exactly that, and it is also the more
 * durable half: a grant protects the columns somebody remembered to list, while
 * a trigger sits on the table and survives a write path nobody has thought of
 * yet, including one added by a future migration that reads none of this.
 * §6ar says the same thing in one line — "a BEFORE INSERT trigger is
 * authoritative and survives a future write path nobody thought about".
 *
 * So the trigger owns the evidence columns, and the column grants (section 7)
 * are used for the different job they are good at: closing `id` and
 * `created_at`, which no legitimate caller sends at all.
 *
 * ── WHAT THE TRIGGER DOES, AND WHY IT REFUSES RATHER THAN TIDIES ──────────
 *
 * The client tells the server what sentence it displayed. The server does NOT
 * store those bytes. It uses them as a LOOKUP KEY into
 * `waitlist_consent_wordings`, and stores the row it finds. That is the whole
 * trick, and it gets three things at once:
 *
 *   · the frozen text is SERVER-AUTHORED — the signer cannot put words in it;
 *   · it is still FROZEN against a later edit to the wordings table;
 *   · a client showing a sentence ICEFALL never wrote is REFUSED, not recorded.
 *
 * That last one is the reason this is better than "the client sends only a
 * version id and the server looks up the text", which was the shape proposed.
 * Version-only is forgery-proof but it is BLIND: a stale deploy still showing
 * last month's sentence would send the current version id, and the server would
 * cheerfully record that the person agreed to words they were never shown. The
 * record would be server-authored, frozen, and false. Matching on the displayed
 * text catches exactly that case, and the version path is kept underneath it
 * for a future client that sends one. If a client ever sends both, the
 * displayed text wins, because it is the only one of the two that is evidence
 * about what a human actually saw.
 *
 * A REFUSAL IS THE CORRECT FAILURE AND IT IS NOT FREE. If the copy in
 * `waitlist.ts` is edited without a matching version row here, every consenting
 * signup starts raising, the visitor sees "Something went wrong. Please try
 * again.", and non-consenting signups keep working. That is loud, it is caught
 * in minutes, and it is recoverable by one INSERT. The alternatives are not:
 * storing the client's bytes makes consent forgeable, storing the in-force
 * wording records a sentence the person did not read, and recording the tick as
 * a decline puts a "no" in the mouth of somebody who said yes. There is no
 * quiet option that is also honest.
 */
create or replace function public.waitlist_consent_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wording public.waitlist_consent_wordings%rowtype;
  v_shown text := nullif(btrim(new.marketing_consent_text), '');
  v_named text := nullif(btrim(new.marketing_consent_version), '');
begin
  /*
   * NOT A GRANT: strip every evidence column. This is the direction that keeps
   * a declined or unasked row from carrying wording that a later "has a
   * wording" query would read as permission. `is not true` rather than `= false`
   * so NULL — never asked — lands here too.
   */
  if new.marketing_consent is not true then
    new.marketing_consent_at      := null;
    new.marketing_consent_text    := null;
    new.marketing_consent_version := null;
    return new;
  end if;

  if v_shown is not null then
    select * into v_wording
      from public.waitlist_consent_wordings w
     where w.purpose = 'marketing'
       and w.wording = v_shown;

    if not found then
      raise exception 'waitlist: the consent wording shown to this person is not one ICEFALL has recorded'
        using hint = 'The sentence the client says it displayed matches no row in waitlist_consent_wordings. Either the copy in icefall-web/src/lib/waitlist.ts was changed without adding a version row here, or the request did not come from the ICEFALL signup form. Add the new wording as a NEW version and ship it before the copy change.';
    end if;

  elsif v_named is not null then
    select * into v_wording
      from public.waitlist_consent_wordings w
     where w.version = v_named
       and w.purpose = 'marketing';

    if not found then
      raise exception 'waitlist: consent version % is not a marketing wording', v_named
        using hint = 'The version named by the client does not exist, or belongs to a different purpose. A consent for one purpose cannot be evidenced with another purpose''s words.';
    end if;

  else
    select * into v_wording
      from public.waitlist_consent_wordings w
     where w.purpose = 'marketing'
       and w.in_force;

    if not found then
      raise exception 'waitlist: a marketing consent arrived but no wording is in force'
        using hint = 'Something recorded a grant without saying what was shown, and there is no current wording to fall back on. Either the caller is broken or marketing consent is not currently being asked for.';
    end if;
  end if;

  /*
   * SERVER-OWNED FROM HERE DOWN. Whatever the client sent in these three is
   * discarded and replaced. The text comes out of the wordings table, never off
   * the wire; the timestamp comes off the database clock, never the client's,
   * because a signer who can date their own consent can date it into a period
   * they were never asked in.
   */
  new.marketing_consent_version := v_wording.version;
  new.marketing_consent_text    := v_wording.wording;
  new.marketing_consent_at      := now();

  return new;
end;
$$;

/*
 * SECURITY DEFINER because it reads `waitlist_consent_wordings`, and `anon` has
 * no privilege on that table and never will — see section 7. A SECURITY INVOKER
 * trigger here would fail 42501 on every consenting signup.
 *
 * REVOKED FROM public AND anon, and a plain `revoke from public` would not be
 * enough on its own because Supabase's default privileges grant `anon`
 * separately. This does NOT stop the trigger firing: PostgreSQL checks EXECUTE
 * on a trigger function when the TRIGGER IS CREATED, not each time it fires, so
 * anon's insert still runs it. Calling it directly is refused by the language
 * itself ("can only be called as a trigger"), so the revoke costs nothing and
 * keeps the definer surface off the API.
 */
revoke all on function public.waitlist_consent_intake() from public, anon;

drop trigger if exists waitlist_consent_intake on public.waitlist;
create trigger waitlist_consent_intake
  before insert on public.waitlist
  for each row execute function public.waitlist_consent_intake();


/* ========================================================================== */
/* 5. THE LOG — because a boolean cannot survive withdrawal                   */
/* ========================================================================== */

/*
 * ── WHY CURRENT-STATE COLUMNS ARE NOT ENOUGH, TRACED THROUGH THE SEQUENCE ─
 *
 * Consent is withdrawable by law and by the sentence the owner wrote —
 * "Unsubscribe any time." So the sequence grant → withdraw → re-grant is
 * ordinary, not exotic, and it is the test any shape has to pass.
 *
 * With columns on `waitlist`: the grant sets three. The withdrawal sets a
 * fourth, `withdrawn_at`. The re-grant has to clear that fourth column, or the
 * row says both "consented" and "withdrawn" at once and nothing can order them.
 * The moment it is cleared, THE FACT THAT THEY EVER WITHDREW IS GONE — and that
 * fact is the one most likely to be asked about, because it is the one that
 * proves ICEFALL honoured an unsubscribe. A withdrawal you cannot evidence is
 * exactly the same problem as a consent you cannot evidence, one step later.
 * Add more columns and it fails again at the second withdrawal. The shape is
 * wrong, not the column count.
 *
 * So: an APPEND-ONLY LOG, one row per decision, and the current state is
 * derived as the latest row per person per purpose. Every state the shape above
 * destroys is a row here that nothing overwrites.
 *
 * ── WHAT A WITHDRAWAL RECORDS, WHICH IS MORE THAN "THEY LEFT" ─────────────
 *
 * When, by what ROUTE, and what they were shown at the time. An unsubscribe
 * that flips a boolean records that somebody left and not what they were told —
 * and "they clicked the link in the footer" and "they replied to the email
 * asking to be removed" are different evidence of the same outcome. `route` is
 * a closed list for the same reason `heard_about` is: free text here is six
 * spellings of one route and no `group by` reunites them.
 *
 * ── `seq`, NOT A uuid, AS THE KEY ─────────────────────────────────────────
 *
 * Ordering is the entire point of a log and a uuid does not order. Nor does
 * `recorded_at` on its own: `now()` is the TRANSACTION clock, so the two events
 * written by one signup share a timestamp exactly, and "the latest one" would
 * be a coin toss. An identity column gives the total order the derivation needs.
 */
create table if not exists public.waitlist_consent_events (
  seq bigint generated always as identity primary key,

  /*
   * `on delete cascade`, and the trade-off is real enough to name. Erasing a
   * waitlist row erases its consent history with it, so ICEFALL loses the
   * evidence that the person withdrew. The alternative is keeping rows about
   * somebody who asked to be forgotten, which is worse and is not ours to
   * choose. The evidence exists to protect the person; it does not outrank them.
   */
  waitlist_id uuid not null references public.waitlist (id) on delete cascade,

  purpose text not null references public.waitlist_consent_purposes (slug)
    on update cascade
    on delete restrict,

  /*
   * `declined` is recorded, not inferred from an absence. It is the fact that
   * says "do not ask this person again", and an absent row would only say
   * "nobody has asked yet" — the same three-state distinction as the column,
   * kept intact through the log.
   */
  decision text not null check (decision in ('granted', 'declined', 'withdrawn')),

  version text references public.waitlist_consent_wordings (version)
    on update cascade
    on delete restrict,

  /* Server-copied from `version` by the freeze trigger. Never accepted from a
   * caller, including service_role. */
  wording text check (wording is null or length(btrim(wording)) between 10 and 500),

  route text not null check (route in (
    'signup-form',        -- the box on icefall.app
    'unsubscribe-link',   -- one click in an email footer. NOT BUILT YET - section 8.
    'email-request',      -- they replied and asked; a person recorded it
    'staff-recorded',     -- recorded on their behalf for any other reason
    'import'              -- carried in from somewhere else, with the reason in `note`
  )),

  recorded_at timestamptz not null default now(),

  /*
   * Free text and deliberately so: this is the one field written by a human
   * accounting for an unusual event, and a closed list cannot anticipate those.
   * It is never read by code and never shown to the person.
   */
  note text check (note is null or length(btrim(note)) between 1 and 1000)
);

create index if not exists idx_waitlist_consent_events_waitlist
  on public.waitlist_consent_events (waitlist_id, purpose, seq desc);
create index if not exists idx_waitlist_consent_events_purpose
  on public.waitlist_consent_events (purpose);
create index if not exists idx_waitlist_consent_events_version
  on public.waitlist_consent_events (version);

/*
 * ── THE FREEZE, WHICH IS THE ONE CHOKE POINT FOR EVERY WRITER ─────────────
 *
 * `wording` is always overwritten from the referenced version and never taken
 * from the caller. That closes forgery not just for anon — who has no privilege
 * here at all — but for every future write path including service_role and the
 * dashboard, which is where a well-meaning backfill would otherwise type its own
 * sentence.
 *
 * And a grant for a purpose that needs a wording MUST name one. That is the
 * §6ar-style refusal rather than a tidy-up: a grant with no evidence is not a
 * client mistake to normalise away, it is a record that would later be read as
 * permission.
 */
create or replace function public.waitlist_consent_event_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_needs_wording boolean;
  v_wording text;
begin
  select p.needs_wording into v_needs_wording
    from public.waitlist_consent_purposes p
   where p.slug = new.purpose;

  if new.version is not null then
    select w.wording into v_wording
      from public.waitlist_consent_wordings w
     where w.version = new.version
       and w.purpose = new.purpose;

    if v_wording is null then
      raise exception 'consent wording % does not belong to purpose %', new.version, new.purpose
        using hint = 'A decision about one purpose cannot be evidenced with another purpose''s words.';
    end if;

    new.wording := v_wording;
  else
    -- No version named, so there is no wording. NULL here means "no sentence
    -- was shown", which is a fact, not a gap to fill.
    new.wording := null;
  end if;

  if new.decision = 'granted' and v_needs_wording and new.version is null then
    raise exception 'a granted consent for % must name the wording that was shown', new.purpose
      using hint = 'This purpose is presented as a tick box, and a tick box means nothing without its label. Record the version the person read.';
  end if;

  -- Server clock, always. Same reason as the signup timestamp.
  new.recorded_at := now();

  return new;
end;
$$;

revoke all on function public.waitlist_consent_event_freeze() from public, anon;

drop trigger if exists waitlist_consent_event_freeze on public.waitlist_consent_events;
create trigger waitlist_consent_event_freeze
  before insert on public.waitlist_consent_events
  for each row execute function public.waitlist_consent_event_freeze();

/*
 * ── APPEND-ONLY MEANS NO REWRITING. IT DOES NOT MEAN NO DELETING ──────────
 *
 * UPDATE is refused outright, for every role, because a log that can be edited
 * evidences nothing.
 *
 * DELETE is deliberately NOT blocked, and that is not an oversight. Erasure is
 * a right, and a history nobody can delete is a history that outlives the
 * person's request to be forgotten — the guard would turn a privacy protection
 * into a privacy problem, and would also break the `on delete cascade` above,
 * making a waitlist row undeletable. Nobody reachable from the browser can
 * delete here anyway: section 7 leaves anon and authenticated with no privilege
 * on this table and no policy.
 */
create or replace function public.waitlist_consent_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'waitlist_consent_events is append-only (attempted update on seq %)', old.seq
    using hint = 'A consent decision is not corrected, it is superseded. Append the new decision; the latest row per person per purpose is the current state.';
end;
$$;

drop trigger if exists waitlist_consent_events_append_only on public.waitlist_consent_events;
create trigger waitlist_consent_events_append_only
  before update on public.waitlist_consent_events
  for each row execute function public.waitlist_consent_events_append_only();

comment on table public.waitlist_consent_events is
  'Append-only history of every consent decision for every waitlist address. The CURRENT '
  'state is the latest row per person per purpose - never a column on waitlist, which '
  'records only what was decided at signup and is never updated. Withdrawal is a row here '
  'like any other, so grant -> withdraw -> re-grant keeps all three facts instead of '
  'overwriting the middle one. UPDATE is refused for every role; DELETE is allowed '
  'because erasure is a right and only service_role can reach it. `wording` is copied by '
  'the server from the named version and is never accepted from a caller.';


/* ========================================================================== */
/* 6. WRITING AND READING IT FROM THE CRM                                     */
/* ========================================================================== */

/*
 * ── RECORDING A WITHDRAWAL TODAY, BEFORE THE LINK EXISTS ──────────────────
 *
 * The seeded sentence promises "Unsubscribe any time" and the one-click link is
 * not built (section 8). Until it is, the only way somebody gets removed is by
 * asking a human, and that human needs somewhere to put it that is not a
 * spreadsheet. This is that place.
 *
 * It takes the EMAIL rather than the id because that is what arrives in the
 * request — nobody replying to an email quotes a uuid, and the id is unreadable
 * to anon anyway. Admin-only, and it RAISES for anybody else: an empty result
 * from a permission failure is indistinguishable from "that address is not on
 * the list", and a refusal has to look like a refusal.
 *
 * It also handles `granted` and `declined`, so a re-grant is the same call. The
 * wording is resolved server-side from whatever is in force, never passed in.
 */
create or replace function public.waitlist_record_consent_event(
  p_email text,
  p_purpose text,
  p_decision text,
  p_route text,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_waitlist_id uuid;
  v_needs_wording boolean;
  v_version text;
  v_seq bigint;
begin
  /*
   * `is not true`, never `not`. `is_admin()` returning NULL would make `not
   * is_admin()` evaluate NULL, the `if` would not fire, and the guard would be
   * skipped for exactly the caller it exists to stop. This project has shipped
   * that NULL-bypass before.
   */
  if public.is_admin() is not true then
    raise exception 'waitlist_record_consent_event is admin-only'
      using hint = 'Consent decisions about ICEFALL''s own mailing list are business data. They are recorded by ICEFALL, not by the platform''s users.';
  end if;

  select w.id into v_waitlist_id
    from public.waitlist w
   where w.email = lower(btrim(p_email));

  if not found then
    raise exception 'no waitlist signup for that address'
      using hint = 'Nothing was recorded. An unsubscribe request from an address that never joined is not an error to swallow - it may be a forwarded email, or the wrong address.';
  end if;

  select p.needs_wording into v_needs_wording
    from public.waitlist_consent_purposes p
   where p.slug = p_purpose;

  if not found then
    raise exception 'unknown consent purpose %', p_purpose
      using hint = 'Purposes are added by migration, deliberately. Inventing one here would create a permission nobody was asked for.';
  end if;

  /*
   * A grant needs the wording that is on the page NOW, because that is what the
   * person is agreeing to when they ask to be put back on. A decline or a
   * withdrawal names no wording: they are not agreeing to anything, and the
   * freeze trigger leaves `wording` null with that meaning.
   */
  if p_decision = 'granted' and v_needs_wording then
    select w.version into v_version
      from public.waitlist_consent_wordings w
     where w.purpose = p_purpose
       and w.in_force;

    if v_version is null then
      raise exception 'no wording is in force for purpose %', p_purpose
        using hint = 'Nothing may be recorded as granted while there is no current sentence to grant against.';
    end if;
  end if;

  insert into public.waitlist_consent_events (waitlist_id, purpose, decision, version, route, note)
  values (v_waitlist_id, p_purpose, p_decision, v_version, p_route, nullif(btrim(p_note), ''))
  returning seq into v_seq;

  return v_seq;
end;
$$;

revoke all on function public.waitlist_record_consent_event(text, text, text, text, text) from public, anon;
grant execute on function public.waitlist_record_consent_event(text, text, text, text, text) to authenticated;

comment on function public.waitlist_record_consent_event(text, text, text, text, text) is
  'Append one consent decision for a waitlist address. Admin-only, and it RAISES for '
  'anybody else rather than returning nothing. Handles withdrawal and re-grant as ordinary '
  'rows, so the history survives both. The wording is resolved server-side from whatever '
  'is in force and is never passed in. This is how an unsubscribe request is honoured '
  'until the one-click link is built.';

/*
 * ── THE SIGNUP'S OWN EVENTS, WRITTEN BY THE DATABASE ──────────────────────
 *
 * The log is filled from the `waitlist` insert rather than by the API, for the
 * reason the intake trigger gives: the API is one caller and the table has to
 * hold for all of them. `anon` gets no privilege on the events table at all —
 * SECURITY DEFINER is what lets the trigger write it on their behalf, which
 * also means a signer cannot append an event of their own choosing.
 *
 * TWO EVENTS, OR ONE, AND WHY THE LAUNCH NOTICE IS ALWAYS WRITTEN. Joining IS
 * the request to be told at launch, so that event is unconditional and always
 * `granted`. Its wording is null because no sentence was shown — see section 1.
 * The marketing event is written only when the question was actually put; a
 * `marketing_consent` of NULL means nobody asked, and writing a row for it
 * would turn silence into a decision.
 */
create or replace function public.waitlist_signup_consent_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.waitlist_consent_events (waitlist_id, purpose, decision, version, route)
  values (new.id, 'launch-notice', 'granted', null, 'signup-form');

  if new.marketing_consent is not null then
    insert into public.waitlist_consent_events (waitlist_id, purpose, decision, version, route)
    values (
      new.id,
      'marketing',
      case when new.marketing_consent then 'granted' else 'declined' end,
      new.marketing_consent_version,
      'signup-form'
    );
  end if;

  return null;
end;
$$;

revoke all on function public.waitlist_signup_consent_events() from public, anon;

drop trigger if exists waitlist_signup_consent_events on public.waitlist;
create trigger waitlist_signup_consent_events
  after insert on public.waitlist
  for each row execute function public.waitlist_signup_consent_events();

/*
 * ── THE READER, AND THE READER THAT IS DELIBERATELY NOT HERE ──────────────
 *
 * `waitlist_consent_tally()` returns COUNTS. There is no function here that
 * returns the addresses, and that omission is the important half.
 *
 * `waitlist`'s own table comment says "readable by service_role only", and it
 * has been true since 20260825120000 because there is no SELECT policy and the
 * privilege is revoked. A definer function handing email addresses to
 * `authenticated` — even gated on `is_admin()` — would make that sentence
 * quietly false, and §6as is precisely about a sentence that outlives the thing
 * that made it true. Sending email is a service_role job with a deliberate
 * export behind it, and it stays one. This is `heard_about_tally`'s argument in
 * the same words: the function is the boundary between "183 people" and "these
 * 183 people".
 *
 * IT COUNTS PEOPLE WHO WERE NEVER ASKED, and that row is never omitted. A
 * percentage needs a denominator, and here the denominator is everybody on the
 * list, not everybody who saw the box. "62% consented" computed over only the
 * people who were asked is the kind of number that is confidently wrong, which
 * is the only kind this project actually fears.
 *
 * `granted` HERE MEANS "AS OF NOW", derived from the latest event, so somebody
 * who consented and later withdrew is counted under `withdrawn` and not under
 * `granted`. That is the whole reason the log exists, and it is why no caller
 * should ever count `waitlist.marketing_consent` instead.
 */
create or replace function public.waitlist_consent_tally()
returns table (
  purpose text,
  label text,
  granted integer,
  declined integer,
  withdrawn integer,
  never_asked integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() is not true then
    raise exception 'waitlist_consent_tally is admin-only'
      using hint = 'Who agreed to be emailed is ICEFALL''s business data about its own mailing list. It is not part of anybody''s profile and no signed-in account has any claim on it.';
  end if;

  return query
    with latest as (
      select distinct on (e.waitlist_id, e.purpose)
             e.waitlist_id, e.purpose, e.decision
        from public.waitlist_consent_events e
       order by e.waitlist_id, e.purpose, e.seq desc
    ),
    everyone as (
      select count(*)::int as n from public.waitlist
    )
    select p.slug,
           p.label,
           count(*) filter (where l.decision = 'granted')::int,
           count(*) filter (where l.decision = 'declined')::int,
           count(*) filter (where l.decision = 'withdrawn')::int,
           (e.n - count(l.waitlist_id))::int
      from public.waitlist_consent_purposes p
      cross join everyone e
      left join latest l on l.purpose = p.slug
     group by p.slug, p.label, p.sort_order, e.n
     order by p.sort_order;
end;
$$;

revoke all on function public.waitlist_consent_tally() from public, anon;
grant execute on function public.waitlist_consent_tally() to authenticated;

comment on function public.waitlist_consent_tally() is
  'How many waitlist addresses currently sit in each consent state, per purpose. '
  'Admin-only and it RAISES for anybody else - a refusal must not look like no data. '
  'Counts, never addresses: there is deliberately no function returning the list, because '
  'waitlist is readable by service_role only and one convenience reader would make that '
  'sentence false. `never_asked` is people with no decision recorded for that purpose and '
  'is never omitted, because a consent percentage without it is wrong. States are derived '
  'from the latest event, so a withdrawal is reflected here and never in '
  'waitlist.marketing_consent.';


/* ========================================================================== */
/* 7. PRIVILEGES — the floor under all of it                                  */
/* ========================================================================== */

/*
 * ── THE NEW TABLES ARE INVISIBLE FROM THE BROWSER, ALL THREE ──────────────
 *
 * Nothing on the athlete side of ICEFALL may read any of this. It is not
 * profile data and it is not the signer's data to browse: it is ICEFALL's
 * record of its own marketing permissions. So: RLS on, every privilege revoked
 * from anon and authenticated, and NO POLICIES AT ALL on any of the three.
 *
 * BOTH HALVES ARE REQUIRED AND NEITHER IS REDUNDANT. Supabase's default
 * privileges hand `anon` full access to every new table in `public`, so a table
 * with RLS enabled and no policy is closed by the policy and a table with a
 * policy and no revoke is open by the grant. 20260825120000 said the same thing
 * about `waitlist` and it is the reason that list is not already public.
 *
 * NOTE `revoke ... from public, anon` ON THE FUNCTIONS ABOVE, NOT JUST
 * `public`. Revoking from PUBLIC alone does not close a definer function to
 * anon, because anon holds its own grant from the default privileges rather
 * than inheriting one from PUBLIC. That is a live gotcha in this project.
 *
 * THE PICKER DOES NOT READ THESE TABLES, so no read policy is needed for the
 * signup form. The sentence beside the checkbox is a constant in
 * `icefall-web/src/lib/waitlist.ts`, and section 4 is what keeps the two
 * honest: a client showing a sentence not in `waitlist_consent_wordings` is
 * refused. Serving the wording from the database would need a read policy on a
 * table anon has no other business in, to solve a drift problem that is already
 * solved by refusing the write.
 */
alter table public.waitlist_consent_purposes enable row level security;
alter table public.waitlist_consent_wordings enable row level security;
alter table public.waitlist_consent_events   enable row level security;

revoke all on public.waitlist_consent_purposes from anon, authenticated;
revoke all on public.waitlist_consent_wordings from anon, authenticated;
revoke all on public.waitlist_consent_events   from anon, authenticated;

/*
 * Belt and braces, and cheap: if a future migration adds a policy to one of
 * these without thinking about the grants, these lines are what is left.
 */
drop policy if exists waitlist_consent_purposes_select on public.waitlist_consent_purposes;
drop policy if exists waitlist_consent_wordings_select on public.waitlist_consent_wordings;
drop policy if exists waitlist_consent_events_select   on public.waitlist_consent_events;

/*
 * ── COLUMN GRANTS ON `waitlist`, FOR THE JOB THEY ARE ACTUALLY GOOD AT ────
 *
 * 20260825120000 wrote `grant insert on public.waitlist to anon, authenticated`,
 * which is INSERT on every column — including the two nobody ever sends.
 *
 *   · `created_at` has a default, and a default only applies when the column is
 *     OMITTED. A hostile client posting `created_at: '2020-01-01'` today gets a
 *     signup dated six years before ICEFALL existed, and there is no SELECT
 *     policy, so nobody would see it until an export.
 *   · `id` is a uuid the client could choose, which is how you make two rows
 *     collide on purpose or plant a predictable one.
 *
 * Neither is catastrophic and both are free to close. The table-level privilege
 * is revoked and re-granted per column, because a column grant does nothing
 * while the table-level grant stands.
 *
 * THE LIST IS THE COLUMNS REAL CALLERS ACTUALLY SEND, verified rather than
 * assumed. `icefall-web/api/_waitlist.mjs` posts exactly email, name, source,
 * marketing_consent, marketing_consent_at and marketing_consent_text.
 * `icefall-supabase/tests/rls.test.mjs` inserts email, name and source.
 * `marketing_consent_version` is granted for the future client that sends one.
 * Omitting a granted column is always fine; PostgREST only names the keys in
 * the body, so `id` and `created_at` take their defaults untouched.
 *
 * IF SIGNUPS START FAILING 42501 AFTER THIS FILE, this is the paragraph to
 * read: a caller is sending a column not on the list below, and the fix is to
 * decide whether that column should be client-writable at all before adding it.
 *
 * `marketing_consent_at` AND `marketing_consent_text` ARE ON THE LIST AND ARE
 * STILL NOT AUTHORABLE. The grant lets a client MENTION them; the intake
 * trigger in section 4 runs after the privilege check and overwrites both. That
 * split is the entire design: the grant cannot express "you may say it but not
 * decide it", and the trigger can.
 */
revoke insert on public.waitlist from anon, authenticated;
grant insert (
  email,
  name,
  source,
  marketing_consent,
  marketing_consent_at,
  marketing_consent_text,
  marketing_consent_version
) on public.waitlist to anon, authenticated;

/*
 * ── AND THE SIGNUP RECORD STAYS THE SIGNUP RECORD ─────────────────────────
 *
 * Section 3 claims these four columns can never drift from the log because they
 * are never updated. anon and authenticated cannot update `waitlist` at all —
 * no privilege, no policy — so that claim already holds for everything
 * reachable from the browser. This guard extends it to the roles no policy
 * governs: service_role, the dashboard, a future migration's backfill. Without
 * it, "never updated" is a convention, and a convention is not a guarantee.
 *
 * The rest of the row stays editable: correcting a misspelled name is a normal
 * thing to do and has nothing to do with consent.
 */
create or replace function public.waitlist_consent_columns_frozen()
returns trigger
language plpgsql
as $$
begin
  if new.marketing_consent         is distinct from old.marketing_consent
     or new.marketing_consent_at      is distinct from old.marketing_consent_at
     or new.marketing_consent_text    is distinct from old.marketing_consent_text
     or new.marketing_consent_version is distinct from old.marketing_consent_version then
    raise exception 'the signup consent record on waitlist cannot be edited'
      using hint = 'These four columns are what this person decided AT SIGNUP, which does not change afterwards. To record a withdrawal or a re-grant, append to waitlist_consent_events - the current state is derived from there, never from here.';
  end if;

  return new;
end;
$$;

drop trigger if exists waitlist_consent_columns_frozen on public.waitlist;
create trigger waitlist_consent_columns_frozen
  before update on public.waitlist
  for each row execute function public.waitlist_consent_columns_frozen();

comment on table public.waitlist is
  'Pre-launch signups from icefall-web. Insert-only to anon; readable by service_role '
  'only. The marketing_consent_* columns are the decision made AT SIGNUP and are frozen '
  'after insert; the CURRENT consent state lives in waitlist_consent_events. This list may '
  'be emailed about ICEFALL and NEVER on behalf of an expedition company or any other '
  'third party - the owner was offered that wording and declined it.';


/* ==========================================================================
 * 8. WHAT IS STILL NOT SOLVED, so nobody reads this file as the finished job
 *
 * 1. THE UNSUBSCRIBE LINK DOES NOT EXIST, AND THE SENTENCE PROMISES IT.
 *    "Unsubscribe any time" is seeded above as the words people will agree to,
 *    and there is no one-click route that honours it: no token scheme, no
 *    endpoint, no page. The `unsubscribe-link` route value in section 5 is a
 *    place for that fact to land, not evidence that it exists. Until it does,
 *    the only working route is a person calling
 *    `waitlist_record_consent_event(..., 'withdrawn', 'email-request')`.
 *    THE RULE THAT FOLLOWS: NOTHING MAY BE EMAILED TO THIS LIST UNTIL THE LINK
 *    IS BUILT. Sending under a sentence ICEFALL cannot honour makes the
 *    sentence a false claim, and this project does not record or display those.
 *
 * 2. THE ADDRESS IS UNCONFIRMED. There is no double opt-in — nobody has proved
 *    they own the address they typed, so anybody can put a stranger's address
 *    on this list and tick the box on their behalf. That is a forgery this file
 *    CANNOT close, because it is not about who wrote the row: the evidence
 *    would be perfect and the consent would still not be the address owner's.
 *    A confirmation email closes it and only a confirmation email does.
 *    Until then, `granted` means "somebody typing this address ticked the box".
 *
 * 3. NOTHING ENFORCES RETENTION. There is no rule here about how long an
 *    address that was never used may be kept, and no job that deletes anything.
 *    The constitution was searched for a clause on consent, data minimisation
 *    or retention while this file was written and HAS NONE — §6ar is the
 *    closest thing and it is about write paths, not about how long data lives.
 *    So this is not an omission against a written rule; it is a rule nobody has
 *    written yet, recorded here so the next person knows it is absent rather
 *    than assuming it lives somewhere else.
 *
 * 4. THE CLIENT SENDS THE SENTENCE, NOT THE VERSION. That works and is checked
 *    (section 4), but it means the web app and this table are coupled by a
 *    string. The better shape is for `waitlist.ts` to send
 *    `consentVersion: 'marketing-v1'` ALONGSIDE the text; the version path is
 *    already implemented above and takes over the moment it starts arriving.
 *    Do not remove the text: it is the only thing that catches a stale deploy
 *    showing last month's words under this month's version id.
 *
 * 5. `launch-notice` HAS NO WORDING AND CANNOT GET ONE RETROSPECTIVELY. Its
 *    evidence is the submission. If ICEFALL ever wants to say something
 *    specific about what the launch email will contain, that is a new wording
 *    against that purpose from the day it goes on the page — and everybody who
 *    signed up before it stays evidenced by the act, not by words they never
 *    saw.
 *
 * 6. NOBODY HAS SIGNED UP YET, SO NONE OF THIS HAS RUN AGAINST REAL TRAFFIC.
 *    The count was 0 when this was written. The first honest test of the
 *    section 4 refusal path is the first time somebody changes the copy, and
 *    that is a test better run deliberately on a branch database than
 *    discovered on launch day.
 * ========================================================================== */
