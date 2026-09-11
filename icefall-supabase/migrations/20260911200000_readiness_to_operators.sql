-- ICEFALL — Phase 5: readiness to operators, with consent; and the enquiry→lead bridge.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE BUG THIS FILE FIXES, STATED BEFORE ANYTHING IS BUILT ON TOP OF IT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The operator portal reads ONE commercial object: `public.leads`. Verified,
-- not assumed — `.from("leads")` at icefall-operator/src/backend/supabaseLeads.ts
-- lines 483, 495, 541, 851, 970, 1011 and 1061, and a grep for
-- `operator_enquiries` across icefall-operator/src returns zero hits outside a
-- test fixture.
--
-- The phone app writes ONE object: `public.enquiries`, via `open_enquiry`.
--
-- Nothing has ever joined them. `grep "insert into public.leads"` across every
-- migration in this directory returns nothing, so `leads` has no producer at
-- all and the portal's enquiry screens have, since the day they shipped, been
-- capable of showing only rows an operator typed in themselves
-- (`origin = 'company'`). Every real ICEFALL enquiry has been invisible to the
-- company it was about.
--
-- DIRECTION OF THE FIX: enquiries → leads. The portal is not changed to read
-- `operator_enquiries`; the database is changed so that a handed-off enquiry
-- produces the `leads` row the portal already reads. Two reasons, and the
-- second is the load-bearing one:
--
--   1. A lead is not a rename of an enquiry. An enquiry is a question; a lead
--      is the commercial follow-up, with a pipeline, an assignee and conversion
--      timestamps. The portal is right to read `leads`, and the missing piece
--      was always the step between them.
--
--   2. `leads.company_id` is NOT NULL. That constraint is the honesty gate:
--      a lead cannot exist without a real company, so this bridge cannot
--      manufacture one. An enquiry that names only a mountain produces no lead,
--      and that is correct — there is nobody to give it to.
--
-- WHEN THE BRIDGE FIRES: on the HAND-OFF STAMP, never on insert. The owner's
-- ruling of 31 Aug, recorded at the head of 20260831150000_enquiry_delivery.sql,
-- is "Nothing flows to a company automatically; the desk decides per enquiry."
-- A lead in the operator portal IS the company seeing it, so an on-insert
-- bridge would overturn that ruling silently. This fires from the same
-- deliberate, audited, once-only staff act that already gates
-- `operator_enquiries`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT AN ATHLETE MAY SEND WITH IT, AND UNDER WHAT PERMISSION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A training record going to a commercial desk is a disclosure of personal data
-- to a third party. The existing `health-metrics` purpose says so itself, at
-- 20260903060000_oura_health.sql:136: it "DOES NOT COVER research, sharing with
-- expedition companies, or any use by a third party: each of those is a new
-- purpose and fresh consent from each person." This file is that new purpose.
--
-- CONSENT IS PER SHARE. Not a profile setting, not a remembered preference, not
-- a standing permission the app can consult and act on. Every disclosure is its
-- own decision, and every decision is recorded with the exact words that were
-- on the screen when it was taken AND the exact text that was disclosed. There
-- is deliberately no "always share with operators" anywhere in this schema: the
-- absence is the feature.
--
-- VITALS ARE WITHHELD. Sleep, heart rate, HRV, respiratory rate, SpO2 —
-- Article 9 special category data, held under a purpose that excludes exactly
-- this use. The app-side constant is `VITALS_MAY_REACH_OPERATOR = false` in
-- src/enquiries/operatorDisclosurePolicy.ts, and this table's
-- `vitals_withheld` column records, on every single row, that the withholding
-- was in force when the share was made — so the record proves the policy was
-- applied rather than merely documented. `false` is storable only so that a
-- future, separately-consented widening is not retro-dated into rows made
-- under today's rules.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ONE LOAD-BEARING ASSUMPTION, WRITTEN DOWN BECAUSE IT IS NOT OBVIOUS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `public.enquiries` has FORCE ROW LEVEL SECURITY (20260831110000:253) and
-- grants `authenticated` no INSERT at all. Every function and view below reads
-- or writes it the same way `open_enquiry` already does: as a SECURITY DEFINER
-- object owned by the migration role, which holds BYPASSRLS and is therefore
-- exempt from FORCE. That is the mechanism the shipped enquiry path already
-- depends on, not a new one introduced here — but if these objects are ever
-- created by a role WITHOUT BYPASSRLS, `open_enquiry_with_readiness` will fail
-- on its `select e.company_id`, `enquiries_handoff_to_lead` will fail on its
-- insert, and `operator_readiness_shares` will silently return zero rows.
-- Silently is why it is written here.
--
-- APPLY THIS BY HAND. Nothing in this repository applies migrations.

begin;

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A LATENT BUG IN health_record_consent, FIXED BEFORE IT IS REACHED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `health_record_consent` erases the athlete's entire Oura history whenever a
 * decision is 'withdrawn' or 'declined' — FOR ANY PURPOSE:
 *
 *     if p_decision in ('withdrawn', 'declined') then
 *       perform public.oura_delete_all(v_user, 'consent-' || p_decision);
 *     end if;
 *
 * That was correct while one purpose existed. It becomes a data-loss bug the
 * moment a second one does: an athlete declining to send their training figures
 * to an expedition company would have silently destroyed four hundred days of
 * their own sleep and heart-rate history, on a screen that never mentioned a
 * ring.
 *
 * The erasure is a property of the HEALTH-METRICS purpose — those are the rows
 * that purpose authorises holding — so it is scoped to that purpose here. The
 * existing guarantee is unchanged in every respect for health-metrics: same
 * deletion, same transaction, same reason string. Nothing is weakened; a
 * blast radius is narrowed to the thing it was always about.
 */
create or replace function public.health_record_consent(
  p_purpose text,
  p_decision text,
  p_route text default 'app-settings'
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_needs boolean;
  v_version text;
  v_seq bigint;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select p.needs_wording into v_needs
    from public.health_consent_purposes p where p.slug = p_purpose;

  if v_needs is null then
    raise exception 'unknown consent purpose %', p_purpose;
  end if;

  if p_decision = 'granted' then
    select w.version into v_version
      from public.health_consent_wordings w
     where w.purpose = p_purpose and w.in_force;

    /* `is not false` rather than `not`: an unexpected NULL must not read as
     * "no wording needed" and let an unevidenced grant through. */
    if v_needs is not false and v_version is null then
      raise exception 'no wording is in force for purpose %', p_purpose
        using hint = 'Nothing may be recorded as granted while there is no current sentence to grant against.';
    end if;
  end if;

  insert into public.health_consent_events (user_id, purpose, decision, version, route)
  values (v_user, p_purpose, p_decision, v_version, p_route)
  returning seq into v_seq;

  /*
    WITHDRAWAL DELETES — FOR THE PURPOSE THAT AUTHORISED THE HOLDING, AND ONLY
    THAT ONE. Stopping a send is enough for email, and it is not enough for a
    heart-rate history; but a heart-rate history is not erased by a decision
    about something else. See the note at the head of this migration.
  */
  if p_purpose = 'health-metrics' and p_decision in ('withdrawn', 'declined') then
    perform public.oura_delete_all(v_user, 'consent-' || p_decision);
  end if;

  return v_seq;
end;
$$;

revoke all on function public.health_record_consent(text, text, text) from public, anon;
grant execute on function public.health_record_consent(text, text, text) to authenticated;


/* ═══════════════════════════════════════════════════════════════════════════
 * 2. THE PURPOSE, AND THE SENTENCE IT IS GRANTED AGAINST
 * ═══════════════════════════════════════════════════════════════════════════ */

insert into public.health_consent_purposes (slug, label, description, needs_wording, sort_order) values
  (
    'readiness-to-operator',
    'Sending my training record to an expedition company',
    'Disclosing the athlete''s own ICEFALL training figures to a named expedition company alongside an enquiry: what ICEFALL recorded (sessions, distance, ascent, moving time, objective and plan progress) and what the athlete told ICEFALL (experience level, stated highest altitude, stated skills, disciplines). PER SHARE ONLY - a grant under this purpose authorises ONE named disclosure and is never a standing permission. DOES NOT COVER wearable measurements (sleep, heart rate, HRV, respiratory rate, blood oxygen), injuries, limitations, altitude-illness history, any readiness score, or the athlete''s address: those are withheld by policy, not by preference.',
    true,
    20
  )
on conflict (slug) do nothing;

/*
 * THE WORDING SAYS THE THREE THINGS A PERSON CANNOT CHECK FOR THEMSELVES:
 * that the company is not ICEFALL, that a sent message cannot be recalled from
 * somebody who has already read it, and that ICEFALL is not vouching for them.
 * The rest of it they can verify by reading the preview, which is the whole
 * design.
 */
insert into public.health_consent_wordings (version, purpose, wording, in_force, notes) values
  (
    'readiness-to-operator-2026-09',
    'readiness-to-operator',
    'Send this expedition company the training figures shown above, exactly as they appear, with my enquiry. They are a separate business, not ICEFALL, and once they have read it I cannot take it back - I can stop it being passed on, but not unsee it. It does not include anything about my health, injuries or wearable readings, and ICEFALL has not assessed me and is not recommending me.',
    true,
    'First wording. The preview above it is the substance: this sentence covers only what the preview cannot show - who the recipient is, that disclosure is irreversible once read, and that ICEFALL is not vouching.'
  )
on conflict (version) do nothing;

/*
 * A seventh route: the enquiry compose screen, where a per-share decision is
 * taken. It is its own value for the reason 20260907150000 gives — the route is
 * evidence of how the decision was reached, and a future reader (a support
 * request, an erasure request, an audit) is owed the true one.
 * 'app-share-revoke' is its counterpart: the athlete withdrawing a share they
 * already made.
 *
 * The constraint has had a written name since 20260907150000, so it is dropped
 * by that name — but guarded, because a guessed name that misses would leave
 * BOTH checks in place and reject the new routes with no migration error to
 * explain why.
 */
do $$
declare
  v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.health_consent_events'::regclass
     and c.contype = 'c'
     and c.conname = 'health_consent_events_route_check';

  if v_name is null then
    raise exception
      'health_consent_events_route_check not found - 20260907150000 has not been applied, or the constraint was renamed. Refusing to guess.';
  end if;

  alter table public.health_consent_events drop constraint health_consent_events_route_check;
end
$$;

alter table public.health_consent_events
  add constraint health_consent_events_route_check check (route in (
    'app-settings',       -- the box in the ICEFALL app
    'app-onboarding',     -- the "Connect your accounts" page at the end of sign-up
    'app-disconnect',     -- they pressed Disconnect; recorded as withdrawal
    'app-enquiry',        -- one share, decided on the enquiry they were writing
    'app-share-revoke',   -- they took a share back before it was passed on
    'retention-expiry',   -- the data aged out and the grant went with it
    'staff-recorded',     -- recorded on their behalf, reason in `note`
    'account-deleted'     -- the account went; this is the last thing written
  ));


/* ═══════════════════════════════════════════════════════════════════════════
 * 3. THE DISCLOSURE RECORD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY A ROW AND NOT JUST TEXT IN THE ENQUIRY BODY.
 *
 * The shipped attachment (src/enquiries/readinessAttachment.ts) appends the
 * block to the message, where the athlete can read and edit it. That is the
 * right interaction and it is kept. What it cannot do is answer, six months
 * later, "what exactly did ICEFALL disclose about me, to whom, and under which
 * sentence?" — because the body is one undifferentiated string and the
 * permission left no trace at all.
 *
 * So the share is its own object: the exact characters, frozen; the company;
 * the consent event; and whether it is still in force. That is what a
 * disclosure record has to be able to produce.
 */
create table if not exists public.readiness_shares (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  /* Whose record it is. Cascade for the reason 20260903050000 records: erasing
   * the account erases the evidence of the disclosure, and keeping rows about
   * somebody who asked to be forgotten is the worse of the two. */
  user_id uuid not null references auth.users (id) on delete cascade,

  /* The enquiry it travels with. The share is meaningless without it, and the
   * pair is created in one transaction by `open_enquiry_with_readiness`. */
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,

  /* Who it is addressed to. NULL until the enquiry names a company — which,
   * for a destination-only enquiry, is never. The recipient view below
   * therefore shows an operator nothing at all until ICEFALL hands the enquiry
   * over, which is the same gate `operator_enquiries` uses. */
  company_id uuid references public.companies (id) on delete set null,

  /*
   * EXACTLY WHAT WAS DISCLOSED, character for character.
   *
   * Not a summary and not a set of fields to re-render: the athlete approved
   * these characters in a preview, and a record that stores the INPUTS rather
   * than the OUTPUT would let a later change to the builder rewrite history
   * about what somebody agreed to.
   */
  disclosed_text text not null check (length(btrim(disclosed_text)) between 20 and 8000),

  /* How many lines of each kind, so a reader can see the measured/self-reported
   * split without parsing prose. Rule 5 survives into the audit trail. */
  measured_lines int not null default 0 check (measured_lines >= 0),
  reported_lines int not null default 0 check (reported_lines >= 0),

  /*
   * THE POLICY THAT WAS IN FORCE, STORED ON THE ROW.
   *
   * `true` means wearable readings were withheld from this disclosure. It is
   * written by the app from `VITALS_MAY_REACH_OPERATOR` and defaulted true
   * here, so a row created by any path that forgets to say is a withholding
   * row. A future decision to widen the policy must be a new consent purpose
   * and a new wording; it must not retro-date itself into rows made today,
   * which is the only reason this column can hold `false` at all.
   */
  vitals_withheld boolean not null default true,

  /* The consent decision this share was made under. NOT NULL: there is no such
   * thing as a share without one, and the FK means the wording it was granted
   * against is reachable from the disclosure for as long as both exist. */
  consent_event_seq bigint not null references public.health_consent_events (seq),

  /*
   * WITHDRAWAL. Stops the share being passed on; it does not claim to unsend
   * anything. `revoked_at` is why absence carries its reason here: a share that
   * was never made, a share in force, and a share taken back are three states
   * and the view below distinguishes all three.
   */
  revoked_at timestamptz,

  constraint readiness_shares_revocation_coherent check (
    revoked_at is null or revoked_at >= created_at
  )
);

create index if not exists readiness_shares_user_idx
  on public.readiness_shares (user_id, created_at desc);
create index if not exists readiness_shares_company_idx
  on public.readiness_shares (company_id, created_at desc);
create unique index if not exists readiness_shares_one_per_enquiry
  on public.readiness_shares (enquiry_id);

comment on table public.readiness_shares is
  'One row per disclosure of an athlete''s training record to an expedition company. '
  'Holds the exact text disclosed, the consent decision it was made under, and whether '
  'it is still in force. Never holds wearable readings, injuries, limitations, '
  'altitude-illness history, a readiness score or an address — see vitals_withheld.';

/*
 * IMMUTABLE EXCEPT FOR THE WITHDRAWAL.
 *
 * The same posture as `enquiries_guard`: what was said and who it was said
 * about are the record. Only `revoked_at` moves, once, forward.
 */
create or replace function public.readiness_shares_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a disclosure record is not deleted — revoke it, or erase the account'
      using hint = 'revoked_at records that it was taken back. Removing the row would erase the evidence that it happened.';
  end if;

  if new.user_id is distinct from old.user_id
     or new.enquiry_id is distinct from old.enquiry_id
     or new.company_id is distinct from old.company_id
     or new.disclosed_text is distinct from old.disclosed_text
     or new.measured_lines is distinct from old.measured_lines
     or new.reported_lines is distinct from old.reported_lines
     or new.vitals_withheld is distinct from old.vitals_withheld
     or new.consent_event_seq is distinct from old.consent_event_seq
     or new.created_at is distinct from old.created_at then
    raise exception 'what was disclosed, to whom, and under which consent are immutable';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a withdrawal is stamped once — it is not re-dated or undone';
  end if;

  return new;
end;
$$;

drop trigger if exists readiness_shares_guard on public.readiness_shares;
create trigger readiness_shares_guard
  before update or delete on public.readiness_shares
  for each row execute function public.readiness_shares_guard();

revoke all on function public.readiness_shares_guard() from public, anon, authenticated;


/* ---- RLS, with policies that exist --------------------------------------- */
--
-- RLS ON AND POLICIES WRITTEN. Several ICEFALL tables are deliberately RLS-on
-- with zero policies (20260903060000 §9 lists eleven of them) because every
-- path into them is a SECURITY DEFINER function. This table is different: the
-- ATHLETE must be able to read their own disclosures back without an RPC round
-- trip for every screen that lists them, and "what has ICEFALL sent about me"
-- is a question a person is entitled to answer by looking.
--
-- Writes are still function-only and there is intentionally no INSERT or UPDATE
-- policy: a disclosure is created by `open_enquiry_with_readiness` in the same
-- transaction as the enquiry and the consent event, and withdrawn by
-- `readiness_share_revoke`. A direct INSERT grant would let a client write a
-- `disclosed_text` that nobody previewed and a `consent_event_seq` belonging to
-- somebody else's decision.
--
-- The OPERATOR does not read this table at all. They read the company-scoped
-- view below, for the same reason `operator_enquiries` exists: a row policy
-- gates rows, not columns, and `authenticated` holds a full-column select grant
-- here for staff.

alter table public.readiness_shares enable row level security;

revoke all on public.readiness_shares from public, anon;
grant select on public.readiness_shares to authenticated;

drop policy if exists readiness_shares_select_own on public.readiness_shares;
create policy readiness_shares_select_own on public.readiness_shares
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists readiness_shares_select_staff on public.readiness_shares;
create policy readiness_shares_select_staff on public.readiness_shares
  for select to authenticated
  using (public.is_staff());


/* ---- What the company sees ----------------------------------------------- */
/*
 * Same construction as `operator_enquiries`, and gated on the same fact: an
 * operator sees a disclosure only once ICEFALL has deliberately handed the
 * enquiry it belongs to over to them. Until then the share exists, the athlete
 * can see it, and the company cannot.
 *
 * A REVOKED SHARE DROPS OUT. `revoked_at is null` in the WHERE clause, so
 * withdrawal takes effect on the operator's next read. That is the honest limit
 * of what withdrawal can do, and the consent wording says so in those terms:
 * it stops the passing on, it cannot unsee.
 *
 * `user_id` IS NOT IN THE COLUMN LIST. The company is being shown a training
 * record attached to an enquiry they already have; they do not need, and must
 * not be handed, a foreign key into the athlete's account.
 */
drop view if exists public.operator_readiness_shares;
create view public.operator_readiness_shares
with (security_barrier)
as
  select
    s.id,
    s.created_at,
    s.company_id,
    s.enquiry_id,
    s.disclosed_text,
    s.measured_lines,
    s.reported_lines,
    s.vitals_withheld
  from public.readiness_shares s
  join public.enquiries e on e.id = s.enquiry_id
  where s.revoked_at is null
    and s.company_id is not null
    and e.handed_off_at is not null
    and public.is_company_member(s.company_id);

comment on view public.operator_readiness_shares is
  'Training records athletes chose to disclose, on enquiries ICEFALL has handed to the '
  'caller''s company. The WHERE clause is the access rule. Excludes user_id, the consent '
  'event and revoked shares. vitals_withheld is true on every row ICEFALL has ever '
  'written: wearable readings are withheld from operators by policy.';

revoke all on public.operator_readiness_shares from public, anon;
grant select on public.operator_readiness_shares to authenticated;


/* ═══════════════════════════════════════════════════════════════════════════
 * 3b. WHO THERE IS TO SHARE WITH — the recipient must be nameable
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A consent screen that cannot name the recipient is not consent. "Send this to
 * the expedition company" is a sentence about nobody; "Send this to <name>" is a
 * decision a person can actually take.
 *
 * The phone app cannot name one today. `companies_select`
 * (20260828100000:495-498) is `is_staff() or is_company_member(id)`, so an
 * athlete reading that table gets zero rows — and the app's own operator
 * directory is a client-side array of slugs (`op-elite-exped`), which is why
 * src/enquiries/send.ts:11-21 explains at length that an enquiry can only name
 * a mountain. A uuid cannot be conjured from a slug and it must not be.
 *
 * What IS readable is the marketplace: `products_select`
 * (20260828110000:968-970) lets any signed-in user read a product with
 * `status = 'live'`, and a product names its own company. So a company that has
 * published a live product has, by that act, made itself a nameable recipient —
 * and the `companies_select` comment anticipated exactly this route: "the
 * operator directory the consumer app renders is built from approved, published
 * content, not from this table."
 *
 * THIS VIEW IS THAT DIRECTORY, AND IT IS AS NARROW AS IT CAN BE. Name and slug,
 * for companies with at least one live product. No status, no verification
 * state, no documents_checked_at, no internal anything: a consumer app showing
 * "verified" beside a company name is making a claim about somebody's business,
 * and 20260828100000 is explicit that `verified` means only that ICEFALL looked
 * at documents. Nothing here invites that reading because nothing here carries
 * it.
 *
 * IT IS ALSO THE HONEST EMPTY STATE. If no company has published a live
 * product, this view is empty, the app has no recipient to name, and the share
 * control is not rendered at all. That is the correct outcome, not a gap to be
 * filled with a sample listing.
 */
drop view if exists public.live_operator_companies;
create view public.live_operator_companies
with (security_barrier)
as
  select distinct
    c.id,
    c.slug,
    c.name
  from public.companies c
  where exists (
    select 1 from public.products p
     where p.company_id = c.id
       and p.status = 'live'
  );

comment on view public.live_operator_companies is
  'Companies an athlete may name as the recipient of an enquiry or a readiness share: '
  'those with at least one live marketplace product. Name and slug only — deliberately '
  'no verification status, because a consumer app printing "verified" beside a business '
  'makes a claim ICEFALL''s own schema says it cannot support.';

revoke all on public.live_operator_companies from public, anon;
grant select on public.live_operator_companies to authenticated;


/* ═══════════════════════════════════════════════════════════════════════════
 * 4. THE WRITE PATH
 * ═══════════════════════════════════════════════════════════════════════════ */

/*
 * ONE CALL, ONE TRANSACTION: the enquiry, the consent decision and the
 * disclosure.
 *
 * Deliberately not three client calls. A client that sent the enquiry and then
 * failed to record the consent would have disclosed under no permission; one
 * that recorded consent and failed to send would hold a grant for a disclosure
 * that never happened. Both are wrong records of the same event, and neither is
 * recoverable from the other end. They are one act, so they are one statement.
 *
 * `p_readiness_text` is the EXACT string the athlete read in the preview. The
 * server does not rebuild it, cannot rebuild it, and should not: the only text
 * anybody consented to is the text that was on the screen.
 */
create or replace function public.open_enquiry_with_readiness(
  p_body text,
  p_readiness_text text,
  p_vitals_withheld boolean default true,
  p_product_id uuid default null,
  p_destination_id text default null,
  p_company_id uuid default null,
  p_origin_app text default 'phone_app',
  p_origin_screen text default null,
  p_measured_lines int default 0,
  p_reported_lines int default 0
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_enquiry jsonb;
  v_enquiry_id uuid;
  v_company uuid;
  v_seq bigint;
  v_share uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  if p_readiness_text is null or length(btrim(p_readiness_text)) < 20 then
    raise exception 'a disclosure records the text that was shown — there is none here'
      using hint = 'Call open_enquiry instead when the athlete is sending nothing about themselves.';
  end if;

  /*
   * THE WITHHOLDING IS ENFORCED, NOT TRUSTED.
   *
   * `vitals_withheld = false` is storable (see the column comment) but not by
   * this function: today's consent wording promises wearable readings are not
   * included, and a client asserting otherwise would be disclosing under a
   * sentence that says the opposite. Widening the policy means a new purpose
   * and a new wording, at which point this check moves with them.
   */
  if p_vitals_withheld is not true then
    raise exception 'wearable readings may not be disclosed to an operator under the current consent wording'
      using hint = 'VITALS_MAY_REACH_OPERATOR is false. Widening it needs a new consent purpose and wording, not a parameter.';
  end if;

  /*
   * The enquiry, through the one function that knows what an enquiry is.
   *
   * POSITIONAL, AND THE ORDER IS COPIED FROM THE SIGNATURE ABOVE IT:
   *   open_enquiry(p_body, p_product_id, p_destination_id, p_company_id,
   *                p_origin_app, p_origin_screen)
   *
   * Named notation would read better and is avoided deliberately. This
   * function's own parameters carry the SAME names as the callee's, so every
   * argument would be written `p_body => p_body` — a form where the left-hand
   * side is syntax and the right-hand side is a plpgsql variable. That
   * distinction is one the plpgsql parser does make, and it is not one a future
   * reader should have to know in order to trust the call. Positional is
   * unambiguous to both.
   */
  v_enquiry := public.open_enquiry(
    p_body,
    p_product_id,
    p_destination_id,
    p_company_id,
    p_origin_app,
    p_origin_screen
  );
  v_enquiry_id := (v_enquiry ->> 'id')::uuid;

  /* Whatever the resolver decided the object's company is — which for a
   * destination-only enquiry is NULL, and stays NULL. */
  select e.company_id into v_company
    from public.enquiries e where e.id = v_enquiry_id;

  /* The decision, against whatever sentence is in force right now. Raises if
   * there is none — no wording, no grant, and therefore no share. */
  v_seq := public.health_record_consent('readiness-to-operator', 'granted', 'app-enquiry');

  insert into public.readiness_shares
    (user_id, enquiry_id, company_id, disclosed_text,
     measured_lines, reported_lines, vitals_withheld, consent_event_seq)
  values
    (v_uid, v_enquiry_id, v_company, btrim(p_readiness_text),
     greatest(coalesce(p_measured_lines, 0), 0),
     greatest(coalesce(p_reported_lines, 0), 0),
     true, v_seq)
  returning id into v_share;

  /*
   * `share` is returned; the enquiry id still is not shown to anybody. The
   * share id is what a withdrawal needs, and the athlete's own list is where
   * they get it — see the note in src/enquiries/send.ts on why a uuid a sender
   * cannot quote is a fabricated receipt.
   */
  return jsonb_build_object('ok', true, 'share', v_share, 'delivered_to_company', v_company is not null);
end;
$$;

revoke all on function public.open_enquiry_with_readiness(text, text, boolean, uuid, text, uuid, text, text, int, int)
  from public, anon;
grant execute on function public.open_enquiry_with_readiness(text, text, boolean, uuid, text, uuid, text, text, int, int)
  to authenticated;


/*
 * Taking it back.
 *
 * Records a 'withdrawn' decision AND stamps the share, in one transaction, for
 * the same reason the grant is atomic. Returns what withdrawal actually
 * achieved, because the two cases are materially different to the person
 * asking: an unhanded share is stopped before anyone outside ICEFALL read it;
 * a handed-off one is stopped from here on, and the operator may already have
 * read it. Neither answer is softened into the other.
 */
create or replace function public.readiness_share_revoke(p_share_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_revoked timestamptz;
  v_handed timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select s.user_id, s.revoked_at, e.handed_off_at
    into v_owner, v_revoked, v_handed
    from public.readiness_shares s
    join public.enquiries e on e.id = s.enquiry_id
   where s.id = p_share_id;

  if v_owner is null then
    raise exception 'no such share';
  end if;
  if v_owner <> v_uid then
    /* A shared message with "no such share" would be kinder to somebody
     * probing ids; it is not kinder to the owner, who needs to know this one
     * is not theirs rather than that it does not exist. */
    raise exception 'that disclosure is not yours to withdraw';
  end if;
  if v_revoked is not null then
    return jsonb_build_object('ok', true, 'already', true, 'seen_by_company', v_handed is not null);
  end if;

  perform public.health_record_consent('readiness-to-operator', 'withdrawn', 'app-share-revoke');

  update public.readiness_shares
     set revoked_at = now()
   where id = p_share_id;

  return jsonb_build_object('ok', true, 'already', false, 'seen_by_company', v_handed is not null);
end;
$$;

revoke all on function public.readiness_share_revoke(uuid) from public, anon;
grant execute on function public.readiness_share_revoke(uuid) to authenticated;


/* ═══════════════════════════════════════════════════════════════════════════
 * 5. THE BRIDGE — a handed-off enquiry becomes the lead the portal reads
 * ═══════════════════════════════════════════════════════════════════════════ */

alter table public.leads
  add column if not exists enquiry_id uuid references public.enquiries (id) on delete set null,
  add column if not exists readiness_share_id uuid references public.readiness_shares (id) on delete set null;

/* One lead per enquiry. Postgres allows many NULLs in a unique index, so
 * operator-typed leads (which have no enquiry) are unaffected. */
create unique index if not exists leads_one_per_enquiry
  on public.leads (enquiry_id)
  where enquiry_id is not null;

comment on column public.leads.enquiry_id is
  'The ICEFALL enquiry this lead was produced from, when it was. NULL on operator-typed '
  'leads (origin = ''company''), which have no enquiry behind them. Written once, by '
  'enquiries_handoff_to_lead, at hand-off.';
comment on column public.leads.readiness_share_id is
  'The training record the athlete chose to disclose with the enquiry, when they did. '
  'NULL is the ordinary case and means no disclosure was made — never that one was made '
  'and lost. Read the content through public.operator_readiness_shares, which re-checks '
  'hand-off and withdrawal; this column is the join, not the permission.';

/*
 * THE BRIDGE ITSELF.
 *
 * SECURITY DEFINER, matching `enquiries_handoff_audit` directly above it in
 * 20260831150000 and for the same reason: the act is ICEFALL's, decided by the
 * policy on the enquiry, and must not additionally depend on the stamping
 * staff member holding an insert grant on a second table.
 *
 * WHAT IT REFUSES TO DO, each for a written reason:
 *
 *   NO COMPANY, NO LEAD. `leads.company_id` is NOT NULL and the hand-off guard
 *   has already refused a null company, so this branch is unreachable today —
 *   it is written anyway, because a guard one file away is not a guarantee in
 *   this one.
 *
 *   NO SENDER, NO LEAD. `leads_customer_coherent` requires a customer on an
 *   `origin = 'icefall'` lead. A visitor enquiry has `sender_id` NULL (the
 *   anonymous path carries an email instead), so it cannot become an ICEFALL
 *   lead without either inventing a customer or mislabelling the origin. It
 *   gets neither: the hand-off still succeeds and the enquiry still reaches the
 *   company through `operator_enquiries`. The absence is logged as itself.
 *
 *   NO SECOND LEAD. `on conflict do nothing` against the partial unique index,
 *   so a replayed or repaired hand-off cannot duplicate a commercial record.
 *
 * `source_page` carries the origin screen, which is what that column is for
 * ("Phone", "Referral" — see 20260830160000). It is not a place to put prose,
 * and in particular the readiness text does not go there: that has its own
 * table and its own permission.
 */
create or replace function public.enquiries_handoff_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_share uuid;
begin
  if new.company_id is null then
    return new;
  end if;

  if new.sender_id is null then
    raise notice 'enquiry % handed off with no ICEFALL sender — no lead created (a lead of ICEFALL origin requires a customer)', new.id;
    return new;
  end if;

  select s.id into v_share
    from public.readiness_shares s
   where s.enquiry_id = new.id and s.revoked_at is null;

  insert into public.leads
    (company_id, customer_id, product_id, destination_id,
     origin, status, source_page, enquiry_id, readiness_share_id, created_at)
  values
    (new.company_id, new.sender_id, new.product_id, new.destination_id,
     'icefall', 'new',
     coalesce(nullif(btrim(new.origin_screen), ''), new.origin_app),
     new.id, v_share, new.handed_off_at)
  on conflict (enquiry_id) where enquiry_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists enquiries_handoff_to_lead on public.enquiries;
create trigger enquiries_handoff_to_lead
  after update on public.enquiries
  for each row
  when (old.handed_off_at is null and new.handed_off_at is not null)
  execute function public.enquiries_handoff_to_lead();

revoke all on function public.enquiries_handoff_to_lead() from public, anon, authenticated;

commit;

/* ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT IN THIS FILE — named rather than left to be discovered
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE OPERATOR PORTAL DOES NOT RENDER THE DISCLOSURE YET. It selects a fixed
 * column list (`LEAD_COLUMNS`, icefall-operator/src/backend/supabaseLeads.ts:210)
 * that does not include `readiness_share_id`, and it has no reader for
 * `operator_readiness_shares`. After this migration the portal WILL show real
 * ICEFALL enquiries as leads — that is the bug fixed — but the training record
 * attached to one needs two lines in that app, which is another session's file.
 * The ICEFALL app is written to say exactly this and to promise nothing more.
 *
 * A PHONE-APP ENQUIRY STILL NAMES A MOUNTAIN, NOT A COMPANY.
 * `enquiries_resolve_object` (20260831110000:110-115) sets `company_id` only on
 * the product branch, so an enquiry sent from the peak screens cannot be handed
 * off and cannot produce a lead. The path that works end to end today is a
 * PRODUCT enquiry: `products` with `status = 'live'` are readable by any
 * signed-in user (`products_select`, 20260828110000:968), a product names its
 * own company, and that is the only way this app can honestly name one. Making
 * destination enquiries deliverable means deciding which company a mountain
 * belongs to, which is an owner decision and is deliberately not made here.
 *
 * NO NOTIFICATION. Nothing tells the operator a lead arrived;
 * `operator_notifications` exists and this file does not write to it, because
 * what that table is for is another session's contract.
 */
