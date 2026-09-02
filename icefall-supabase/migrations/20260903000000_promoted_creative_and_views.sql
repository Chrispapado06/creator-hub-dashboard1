/* ==========================================================================
 * Promoted placements — the words an ad carries, the surface it runs on, and
 * the count it earns.
 *
 * WHAT WAS BROKEN, ESTABLISHED BY QUERY AGAINST THE LIVE DATABASE (2026-09-02):
 * `promoted_placements` is live and its RLS is already the load-bearing part —
 *
 *     promoted_select using (
 *       (status = 'active' and current_date between starts_on and ends_on)
 *       or is_company_member(company_id) or is_staff() )
 *
 * — so the SERVER, not the client, decides that a draft and an expired campaign
 * are unreadable by a climber. Nothing below re-implements that check as a
 * security boundary, and no comment in this file claims a client-side date
 * filter is one. It is a convenience. The policy above is the guarantee.
 *
 * The break was elsewhere: AN AD ROW HAD NO WORDS OF ITS OWN. It got them by
 * pointing at a company, a post or a product — and `promoted_one_target`
 * *required* one of those pointers. Live row counts on the day this was
 * written: companies 0, products 0, promoted_placements 0, profiles 2. So the
 * only rows the schema permitted were rows that render blank, and a card built
 * to read this table would have drawn an empty rectangle labelled Promoted.
 *
 * There is a second, worse version of the same problem that no row count shows.
 * `companies_select` is
 *
 *     using (is_staff() or is_company_member(id))
 *
 * so a climber CANNOT READ `companies` AT ALL. Even with the table full, the
 * advertiser's name could never have been resolved by a join from the phone.
 * The name has to travel on the placement or it does not travel.
 *
 * WHAT THIS FILE ADDS
 *   A. `creative_*` — the ad's own display copy, so a placement is a complete
 *      thing that renders without reading a table the reader cannot read.
 *   B. `promoted_placement_views` + `promoted_dismissals` + the aggregates —
 *      one row per person per placement, a COUNT the company may read and rows
 *      it may not, modelled on `channel_message_views` (20260902180000).
 *   C. `surfaces` — where a placement runs. Today one ad would appear on Home
 *      and in stories and in the feed at once, because nothing let it say.
 *   D. A guard: no REAL business is rendered as promoted without a recorded
 *      deal. Elite Exped, 14 Peaks and 8K Expeditions are real companies named
 *      in this product on checkable facts alone; a promoted card is a public
 *      claim of a paid relationship, and that claim must have a countersignature
 *      behind it before the database will let it go live.
 *
 * WHAT THIS FILE DOES NOT DO, AND CANNOT: exclude subscribers from promotion
 * delivery. "Subscribers see no promotions" is a real rule and it stays a
 * reading-app rule, because billing state is not in this database (the blue
 * mark is its own system, per the 31 Aug three-marks decision). This is the one
 * part of delivery the server cannot enforce, and it is said here rather than
 * quietly assumed somewhere else.
 * ========================================================================== */

/* ==========================================================================
 * A. THE AD'S OWN WORDS
 * ========================================================================== */

alter table public.promoted_placements
  -- The advertiser's name AS IT SHOULD APPEAR on the card. Not a join to
  -- `companies.name`, for three separate reasons, any one of which is enough:
  --   1. `companies_select` refuses the row to every climber (above), so the
  --      join does not exist from the surface that needs it.
  --   2. Advertising copy is APPROVED COPY. If the name were a join, renaming
  --      the company row would silently rewrite live advertising that nobody
  --      re-approved — including the disclosure that names who paid.
  --   3. A trading name is not a legal name and neither is reliably the name a
  --      campaign was sold under.
  add column if not exists creative_company_name text,
  -- One line. The claim the card leads with.
  add column if not exists creative_headline text,
  -- Two lines at most. Elaboration, never the claim itself — see the
  -- renderability constraint below, which does NOT require this.
  add column if not exists creative_body text,
  -- The button's words, in the advertiser's voice: "See the itinerary".
  add column if not exists creative_cta_label text,
  -- Where the button goes, INSIDE ICEFALL. A path, never a URL.
  add column if not exists creative_cta_href text;

/* Lengths are constrained per field rather than in one lump so a rejected
   campaign says which field was too long. Dropped-then-added so this file
   re-runs. The numbers are what a phone card can hold without the last word
   being cut off — a headline that truncates is a claim the reader half-saw. */

alter table public.promoted_placements drop constraint if exists promoted_creative_company_name_len;
alter table public.promoted_placements
  add constraint promoted_creative_company_name_len check (
    creative_company_name is null
    or length(trim(creative_company_name)) between 1 and 60
  );

alter table public.promoted_placements drop constraint if exists promoted_creative_headline_len;
alter table public.promoted_placements
  add constraint promoted_creative_headline_len check (
    creative_headline is null or length(trim(creative_headline)) between 1 and 70
  );

alter table public.promoted_placements drop constraint if exists promoted_creative_body_len;
alter table public.promoted_placements
  add constraint promoted_creative_body_len check (
    creative_body is null or length(trim(creative_body)) between 1 and 160
  );

alter table public.promoted_placements drop constraint if exists promoted_creative_cta_label_len;
alter table public.promoted_placements
  add constraint promoted_creative_cta_label_len check (
    creative_cta_label is null or length(trim(creative_cta_label)) between 1 and 24
  );

/*
 * THE DESTINATION IS AN IN-APP PATH AND THE DATABASE ENFORCES IT.
 *
 * Written as four plain string tests rather than one regular expression,
 * because each test is a separate thing being refused and a reader can check
 * them one at a time:
 *   - starts with "/"        => not "https://…", not "javascript:…"
 *   - does not start with "//" => not a protocol-relative link to another host,
 *                                 which LOOKS like a path and is not one
 *   - no whitespace          => one token, so nothing is hiding after a space
 *   - 1..300 characters
 *
 * An advertiser who could set an off-app destination could send a climber
 * anywhere from inside a card ICEFALL vouched for by rendering. The click stays
 * on a route this app controls.
 */
alter table public.promoted_placements drop constraint if exists promoted_creative_cta_href_is_in_app;
alter table public.promoted_placements
  add constraint promoted_creative_cta_href_is_in_app check (
    creative_cta_href is null
    or (
      length(creative_cta_href) between 1 and 300
      and left(creative_cta_href, 1) = '/'
      and left(creative_cta_href, 2) <> '//'
      and creative_cta_href !~ '[[:space:]]'
    )
  );

/* --------------------------------------------------------------------------
 * NOT NULL? NO — AND THE REASON IS NOT TIMIDITY.
 *
 * The table is empty, so `add column not null` would have succeeded. It is
 * still wrong, twice over:
 *
 *   1. `status = 'draft'` EXISTS PRECISELY FOR THE HALF-FILLED STATE. A
 *      campaign is built over several sittings — the company buys the window,
 *      then writes the copy. NOT NULL at insert forces a placeholder into every
 *      new draft, and a placeholder is a fake value that can go live by being
 *      forgotten. This schema has already ruled on that shape once:
 *      "Not chosen yet is a real state and it renders as one"
 *      (20260829120000, on placements.product_id).
 *
 *   2. THE POINTER PATH IS STILL REAL. A placement that points at a post or a
 *      product legitimately has no creative copy of its own — its words live on
 *      the thing it promotes. NOT NULL would force that campaign to duplicate
 *      copy it does not own, and duplicated copy drifts.
 *
 * SO THE REQUIREMENT MOVES FROM THE COLUMN TO THE STATUS. The words are
 * optional to WRITE and mandatory to SHIP: a row may be `active` only if it can
 * render. Combined with `promoted_select` — which shows a climber nothing but
 * active, in-date rows — this is what actually closes the blank-card hole:
 * there is no state in which a reader can be handed a placement with nothing to
 * draw. NOT NULL would have blocked drafting and still not have guaranteed
 * that, because a row with a headline and no call to action is equally blank
 * where it matters.
 *
 * `creative_body` is deliberately NOT required: a headline and a button is a
 * complete card, and a body is elaboration. Requiring it would invite the
 * padding sentence that says nothing.
 * -------------------------------------------------------------------------- */
alter table public.promoted_placements drop constraint if exists promoted_renderable_when_active;
alter table public.promoted_placements
  add constraint promoted_renderable_when_active check (
    status <> 'active'
    or post_id is not null
    or product_id is not null
    or (
      creative_company_name is not null
      and creative_headline is not null
      and creative_cta_label is not null
      and creative_cta_href is not null
    )
  );

/* --------------------------------------------------------------------------
 * `promoted_one_target` REQUIRED EXACTLY ONE POINTER. IT NOW ALLOWS NONE.
 *
 * The old constraint was right for the table as it stood: a row with no words
 * of its own and no pointer was a row with nothing in it, and forbidding it was
 * correct. A self-contained creative is exactly that row, minus the "nothing in
 * it" — so the rule relaxes from "exactly one" to "at most one", and the
 * emptiness it used to prevent is now prevented by
 * `promoted_renderable_when_active` above, where it belongs.
 *
 * Renamed rather than redefined in place, so that a database carrying the old
 * constraint and a database built from scratch end up identically shaped, and
 * so a reader grepping for `promoted_one_target` finds this paragraph.
 * -------------------------------------------------------------------------- */
alter table public.promoted_placements drop constraint if exists promoted_one_target;
alter table public.promoted_placements drop constraint if exists promoted_at_most_one_target;
alter table public.promoted_placements
  add constraint promoted_at_most_one_target check (
    (post_id is not null)::int + (product_id is not null)::int <= 1
  );

/* --------------------------------------------------------------------------
 * HOW THE TWO PATHS COEXIST, AND WHICH WINS. READ THIS BEFORE WRITING A CLIENT.
 *
 * `post_id` and `product_id` are not deprecated. They are the RICHER path and
 * they become the normal one the day `posts` and `products` have rows in them:
 * a product carries a live price, live departures and a real destination page,
 * and a post carries its own media and its own author. None of that can be
 * frozen into five text columns without going stale.
 *
 * PRECEDENCE IS FIELD BY FIELD, AND THE CREATIVE WINS WHERE IT IS PRESENT:
 *
 *     name      := creative_company_name   ?? (the target's company name)
 *     headline  := creative_headline       ?? (product name / post first line)
 *     body      := creative_body           ?? (product summary / post body)
 *     cta label := creative_cta_label      ?? a default the client owns
 *     cta href  := creative_cta_href       ?? the target's own route
 *     image     := creative_path           ?? the target's own media
 *
 * WHY THE CREATIVE WINS: it is the copy a human approved for THIS campaign. A
 * product's name changing in the catalogue must not silently rewrite an ad that
 * was sold, reviewed and paid for. The pointer is the fallback and the source
 * of everything the creative cannot hold.
 *
 * A row may hold both. That is not a conflict, it is an override with a
 * fallback, and it is the only combination that lets a company promote a real
 * product under campaign-specific wording.
 * -------------------------------------------------------------------------- */

comment on column public.promoted_placements.creative_company_name is
  'The advertiser''s name as it appears on the card. NOT a join to companies.name: `companies_select` refuses that row to every climber, and advertising copy that a rename can rewrite is copy nobody approved. Wins over the post/product path when present.';
comment on column public.promoted_placements.creative_headline is
  'The one line the card leads with. Nullable so a draft can exist before its words do; required by promoted_renderable_when_active before the row may go active.';
comment on column public.promoted_placements.creative_body is
  'Two lines of elaboration at most. Deliberately NOT required even when active — a headline and a button is a complete card, and a mandatory body invites a padding sentence.';
comment on column public.promoted_placements.creative_cta_label is
  'The button''s words, in the advertiser''s voice. Required before the row may go active.';
comment on column public.promoted_placements.creative_cta_href is
  'An in-app path, enforced: starts with a single "/", no whitespace, at most 300 characters. A promoted card cannot send a climber off to another host from inside a surface ICEFALL rendered.';

/* ==========================================================================
 * C. WHICH SURFACE A PLACEMENT RUNS ON
 *
 * Until now nothing on the row said, so every reading surface that ever starts
 * fetching this table would show every active campaign: the same ad on Home,
 * inside the story run, and in the feed, simultaneously, three times over.
 *
 * AN ARRAY, NOT ONE COLUMN AND NOT THREE ROWS. A campaign is a purchase, not a
 * slot: one budget, one set of dates, one creative, one thing the company edits
 * and one number it is shown. Splitting "Home and feed" into two rows would
 * give the same ad two view counts that have to be added up by hand, and two
 * copies of the copy to keep in step.
 *
 * DEFAULT EMPTY — WHICH MEANS NOWHERE. The bug being fixed is "appears
 * everywhere", so the default that replaces it must be silence, not a guess. A
 * placement runs where somebody chose to run it. Active rows must name at least
 * one surface, so "nowhere" is a drafting state and never a shipped one.
 * ========================================================================== */

alter table public.promoted_placements
  add column if not exists surfaces text[] not null default '{}';

alter table public.promoted_placements drop constraint if exists promoted_surfaces_known;
alter table public.promoted_placements
  add constraint promoted_surfaces_known check (
    surfaces <@ array['home', 'story', 'feed']::text[]
  );

alter table public.promoted_placements drop constraint if exists promoted_active_names_a_surface;
alter table public.promoted_placements
  add constraint promoted_active_names_a_surface check (
    status <> 'active' or coalesce(array_length(surfaces, 1), 0) >= 1
  );

comment on column public.promoted_placements.surfaces is
  'Where this placement runs: any of home (the inline card between the greeting and the weather strip), story (a labelled slide in the story run), feed. Empty means nowhere — the default, because the bug this replaced was one ad appearing on every surface at once. An active row must name at least one.';

-- The delivery query is "active, in date, and running on THIS surface".
create index if not exists promoted_surfaces_idx
  on public.promoted_placements using gin (surfaces);

/* ==========================================================================
 * D. A REAL BUSINESS CANNOT BE PROMOTED WITHOUT A RECORDED DEAL
 *
 * ICEFALL names a handful of REAL, identifiable operators — Elite Exped,
 * 14 Peaks, 8K Expeditions — on checkable facts alone, among invented ones. A
 * promoted card is different in kind from a directory entry: it is a public
 * claim that this company paid ICEFALL to put this message in front of you. Made
 * about a real business without a real deal, that is a false statement about a
 * named third party, and it is the exact accident this project has already had
 * once (20260830120000: a real operator landed in the database from a page
 * editor being tested).
 *
 * THE SHAPE IS THE ONE THIS SCHEMA ALREADY USES for a claim that needs
 * evidence: `companies_verification_coherent` demands a named checker and a
 * date before a company may call itself verified. Same here — a named human, a
 * date, and a filing reference, or the placement does not go live.
 *
 * A TRIGGER, NOT A CHECK, because the answer lives in another table
 * (`companies.real_business`), exactly like `placements_product_is_own`.
 * ========================================================================== */

alter table public.promoted_placements
  -- ICEFALL's own reference for the countersigned insertion order. Free text:
  -- the filing system is not in this database and inventing a shape for it here
  -- would be a guess that later has to be migrated.
  add column if not exists deal_reference text,
  -- The person at ICEFALL who confirmed the deal exists.
  --
  -- DELIBERATELY NO FOREIGN KEY, and this is not an oversight. Every natural
  -- choice is wrong: `on delete set null` would silently un-sign a LIVE
  -- promotion the moment that person left (the guard below would then be
  -- satisfied by history it no longer holds), and `on delete restrict` would
  -- make a departed colleague undeletable. This is a historical record and must
  -- outlive the profile it names — the stance `identity_checks.checked_by`
  -- already takes, and `audit_events` before it.
  add column if not exists deal_confirmed_by uuid,
  add column if not exists deal_confirmed_at timestamptz;

alter table public.promoted_placements drop constraint if exists promoted_deal_reference_len;
alter table public.promoted_placements
  add constraint promoted_deal_reference_len check (
    deal_reference is null or length(trim(deal_reference)) between 1 and 120
  );

comment on column public.promoted_placements.deal_reference is
  'ICEFALL''s own reference for the countersigned insertion order behind this campaign. Required, with a named confirmer and a date, before a placement for a REAL business may go active.';
comment on column public.promoted_placements.deal_confirmed_by is
  'The person at ICEFALL who confirmed the deal. Carries NO foreign key on purpose: `set null` would silently un-sign a live promotion when they left, and this record must outlive the profile it names (same stance as identity_checks.checked_by).';

/*
 * SECURITY DEFINER, AND THAT IS THE WHOLE POINT OF THE FUNCTION.
 *
 * Read `companies` as the caller and the guard fails OPEN: `companies_select`
 * hands back no row to somebody who cannot see that company, `v_real` comes
 * back NULL, and NULL is not TRUE, so the placement sails through. A guard
 * whose bypass is "not being allowed to look" is not a guard. Reading as the
 * definer means the row is always found, so the only NULL possible is a genuine
 * NULL — and `real_business` is `not null default false`, so there is none.
 *
 * `is true` rather than `not ... is false`, for the same reason stated at
 * length elsewhere in this schema: a NULL comparison that reads like a boolean
 * is how a check silently stops checking.
 */
create or replace function public.promoted_real_business_needs_a_deal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_real boolean;
begin
  -- A draft may say anything about anyone; nobody is being shown it. The claim
  -- only becomes public at `active`, so that is where the bar sits.
  if new.status is distinct from 'active' then
    return new;
  end if;

  select c.real_business into v_real
    from public.companies c
   where c.id = new.company_id;

  if v_real is true
     and (new.deal_reference is null
          or new.deal_confirmed_by is null
          or new.deal_confirmed_at is null) then
    raise exception
      'a real business cannot be shown as promoted without a recorded deal'
      using hint = 'Record deal_reference, deal_confirmed_by and deal_confirmed_at, '
                   'or leave this placement in draft. A promoted card is a public '
                   'claim that this company paid for it.';
  end if;

  return new;
end;
$$;

revoke all on function public.promoted_real_business_needs_a_deal() from public, anon, authenticated;

drop trigger if exists promoted_real_business_deal on public.promoted_placements;
create trigger promoted_real_business_deal
  before insert or update of status, company_id, deal_reference, deal_confirmed_by, deal_confirmed_at
  on public.promoted_placements
  for each row execute function public.promoted_real_business_needs_a_deal();

/*
 * THE OTHER DIRECTION, WHICH A TRIGGER ON THE PLACEMENT CANNOT SEE: a company
 * that was invented when its campaign went live is later marked REAL. Nothing
 * touches the placement row, so nothing re-checks it, and a live promotion for
 * a real business with no deal behind it appears without a single write to the
 * table that guards it.
 *
 * Marking a company real therefore SUSPENDS its unbacked live placements. That
 * is the safe direction and it is deliberately not silent-and-lenient: the
 * campaign stops, the company is told, and it restarts the moment a deal
 * reference is recorded. Losing a day of an invented company's advertising is
 * cheaper than one false public claim about a real one.
 */
create or replace function public.companies_real_business_suspends_promotions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.real_business is true and old.real_business is distinct from true then
    update public.promoted_placements p
       set status = 'suspended'
     where p.company_id = new.id
       and p.status = 'active'
       and (p.deal_reference is null
            or p.deal_confirmed_by is null
            or p.deal_confirmed_at is null);
  end if;
  return new;
end;
$$;

revoke all on function public.companies_real_business_suspends_promotions() from public, anon, authenticated;

drop trigger if exists companies_real_business_suspends_promos on public.companies;
create trigger companies_real_business_suspends_promos
  after update of real_business on public.companies
  for each row execute function public.companies_real_business_suspends_promotions();

/* ==========================================================================
 * B. COUNTED VIEWS — one row per person per placement
 *
 * Modelled on `channel_message_views` (20260902180000) and for its reasons,
 * repeated here because they are the reasons this table has this shape:
 *
 *   COUNTED, NOT ESTIMATED. One row per person per placement means the number
 *   is the number of distinct people who opened the ad — a fact. It is also the
 *   only shape that cannot double-count somebody who scrolls past twice, which
 *   an incrementing counter eventually always does. The cost is a row per read;
 *   the benefit is a figure an advertiser can be invoiced against.
 *
 *   IT IS NOT AN IMPRESSION, A REACH OR A DELIVERY, and nothing built on it may
 *   use those words. This app cannot see a screen. It can see that a client
 *   asked to record a view, and that is all this table claims.
 *
 *   WHO IS COUNTED IS NOT WHO IS NAMED. A company learning that a named climber
 *   opened a named promotion at a named time is surveillance, not analytics.
 *   See the aggregates at the foot of this file, and what they refuse to emit.
 * ========================================================================== */

create table if not exists public.promoted_placement_views (
  placement_id uuid not null references public.promoted_placements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (placement_id, profile_id)
);

create index if not exists promoted_placement_views_placement_idx
  on public.promoted_placement_views (placement_id);

comment on table public.promoted_placement_views is
  'One row per person per placement. The count is what a company may read; the rows are not. Never call this an impression or a reach — the app cannot see a screen, only that a client asked to record a view.';

/* --------------------------------------------------------------------------
 * DISMISSALS — the "x" on the card, and why it needs a table at all.
 *
 * `UpgradePrompt.tsx:16` forbids "an x that dismisses a thing which then
 * returns tomorrow", and the constitution forbids the modal it would otherwise
 * be. A dismissal that lives in the phone's own storage keeps that promise on
 * one device and quietly breaks it on the next one the person signs into, which
 * is the same broken promise with a smaller blast radius.
 *
 * SO IT IS A ROW, AND THERE IS NO DELETE GRANT ON IT. Closing this card means
 * this placement, for this person, permanently. Not "hidden until tomorrow",
 * not "until the cache clears". The absence of a delete privilege is what makes
 * that structural rather than a promise in a comment.
 * -------------------------------------------------------------------------- */

create table if not exists public.promoted_dismissals (
  placement_id uuid not null references public.promoted_placements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (placement_id, profile_id)
);

create index if not exists promoted_dismissals_profile_idx
  on public.promoted_dismissals (profile_id);

comment on table public.promoted_dismissals is
  'Somebody closed this card. Permanent for that person and that placement — there is no delete grant, which is what stops a dismissed promotion coming back tomorrow.';

/* ==========================================================================
 * RLS
 * ========================================================================== */

alter table public.promoted_placement_views enable row level security;
alter table public.promoted_dismissals enable row level security;

/*
 * `(select auth.uid())` throughout, not bare `auth.uid()`: bare, it is
 * evaluated once per row the policy is checked against; wrapped, it is an
 * InitPlan evaluated once per query. Established for all 97 policies in
 * 20260829210000 and the reason is that the failure arrives suddenly — the plan
 * is fine until the table is big enough, and a view-per-person table on a
 * promotion is one of the fastest-growing tables this schema has.
 */

/* ---- views --------------------------------------------------------------- */

/*
 * A view is recorded BY the person who did the viewing, FOR themselves.
 *
 * The `exists` restates active-and-in-date. THAT RESTATEMENT IS NOT A SECURITY
 * BOUNDARY — `promoted_select` already refuses the row, and the subquery here
 * rides that policy because a subquery inside RLS runs as the caller. It is
 * here for COUNT INTEGRITY: a company member CAN read their own draft, so
 * without this they could record views against a placement no climber has ever
 * been shown.
 *
 * `is not true`, not `not (...)`: `is_company_member` coalesces to false today,
 * but a NULL slipping through a bare `not` is how a guard stops guarding, and
 * this schema has been bitten by exactly that shape before.
 *
 * WHY A COMPANY MEMBER IS EXCLUDED FROM ITS OWN COUNT: this number is what the
 * advertiser is shown and, eventually, billed against. A figure the buyer can
 * inflate by opening their own ad in a loop is not a figure anybody can stand
 * behind. Note the asymmetry with dismissals below — it is deliberate, and the
 * reason is written there.
 *
 * A CLIENT MUST TREAT THIS WRITE AS FIRE-AND-FORGET. A company member scrolling
 * past their own campaign will have this insert refused, and that refusal is
 * correct. Nothing on screen may change because of it.
 */
drop policy if exists promoted_placement_views_insert on public.promoted_placement_views;
create policy promoted_placement_views_insert on public.promoted_placement_views
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1
        from public.promoted_placements p
       where p.id = placement_id
         and p.status = 'active'
         and current_date between p.starts_on and p.ends_on
         and public.is_company_member(p.company_id) is not true
    )
  );

-- You may read your own view rows and nobody else's. There is no company branch
-- and no staff branch here on purpose: the aggregate below is the only way this
-- table is ever read by anyone other than its subject.
drop policy if exists promoted_placement_views_select on public.promoted_placement_views;
create policy promoted_placement_views_select on public.promoted_placement_views
  for select to authenticated
  using (profile_id = (select auth.uid()));

/* ---- dismissals ---------------------------------------------------------- */

/*
 * ANYONE WHO CAN SEE THE CARD MAY CLOSE IT, company staff included — the
 * opposite of the rule above, and the asymmetry is the point.
 *
 * The view count is the number reported TO the buyer, so the buyer must not be
 * able to add to it. The dismissal count is bad news ABOUT the buyer; nobody
 * games a number against themselves, and the cost of excluding them is an "x"
 * that visibly fails to work for the one person most likely to test it. An x
 * that silently does nothing is precisely what UpgradePrompt.tsx forbids, so
 * the write always succeeds for whoever can see the card.
 *
 * The honest consequence, stated rather than glossed: `dismissals` counts
 * everybody who closed the card, the company's own staff among them.
 */
drop policy if exists promoted_dismissals_insert on public.promoted_dismissals;
create policy promoted_dismissals_insert on public.promoted_dismissals
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.promoted_placements p where p.id = placement_id)
  );

drop policy if exists promoted_dismissals_select on public.promoted_dismissals;
create policy promoted_dismissals_select on public.promoted_dismissals
  for select to authenticated
  using (profile_id = (select auth.uid()));

/* ==========================================================================
 * THE AGGREGATES THE COMPANY IS ALLOWED TO SEE
 *
 * `channel_message_stats` does this with a single `security_invoker = off` view
 * that joins its parent table. THIS ONE CANNOT, and the difference is worth the
 * paragraph because it looks like a departure from the file it was told to
 * follow.
 *
 * `promoted_placements` carries FORCE ROW LEVEL SECURITY (20260831190000).
 * `channel_messages` does not. Under FORCE, the table owner does NOT bypass
 * RLS — so an owner-executed view that joins `promoted_placements` returns
 * whatever the owner role happens to be entitled to, which depends on role
 * membership and `rolbypassrls` in the hosted project. A security boundary must
 * not rest on a fact like that, in either direction: too little and the company
 * sees nothing, too much and the boundary was never there.
 *
 * So the two halves are separated, and each runs where its answer is
 * deterministic:
 *
 *   WHICH PLACEMENTS YOU SEE  — the caller's own RLS on `promoted_placements`
 *                               (`security_invoker = on`). Deterministic: it is
 *                               the same policy that governs every other read.
 *   HOW MANY PEOPLE           — SECURITY DEFINER functions over
 *                               `promoted_placement_views`, which is
 *                               enable-only, so the owner genuinely does bypass
 *                               its RLS. That is the "count rows the caller
 *                               cannot read" idiom this schema already uses for
 *                               `follower_count_of`.
 *
 * WHY THE SURVEILLANCE VERSION IS NOT ONE CARELESS JOIN AWAY:
 *   - The functions return an INTEGER. Not a set, not a row, not an id. There
 *     is no column here to join `profiles` to, because no per-person column
 *     ever leaves the definer boundary.
 *   - The view emits `placement_id`, `company_id` and two counts. No
 *     `profile_id`, and NO TIMESTAMPS — deliberately. "First viewed at 21:04"
 *     against a small audience is a person, and min/max over a private column
 *     is the classic way an aggregate leaks the row it was hiding.
 *   - The base table's grants are SELECT and INSERT only, and its SELECT policy
 *     is `profile_id = auth.uid()` with no company branch and no staff branch.
 *     The join a careless developer would write returns their own row and
 *     nothing else.
 *
 * WHAT IS NOT CLOSED, SAID PLAINLY RATHER THAN IMPLIED: the count functions are
 * executable by any signed-in caller holding a placement id, so a determined
 * climber can learn how many people saw a given ad. That is the same exposure
 * `channel_message_stats` already has, it is a commercial number rather than a
 * personal one, and the `where` clause on the view below is tidiness — it keeps
 * campaign performance out of the phone app's reach — not a wall. Nothing in
 * this file should be read as claiming otherwise.
 * ========================================================================== */

create or replace function public.promoted_viewer_count(p uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
    from public.promoted_placement_views v
   where v.placement_id = p;
$$;

create or replace function public.promoted_dismissal_count(p uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
    from public.promoted_dismissals d
   where d.placement_id = p;
$$;

revoke all on function public.promoted_viewer_count(uuid) from public, anon;
revoke all on function public.promoted_dismissal_count(uuid) from public, anon;
grant execute on function public.promoted_viewer_count(uuid) to authenticated;
grant execute on function public.promoted_dismissal_count(uuid) to authenticated;

comment on function public.promoted_viewer_count(uuid) is
  'How many distinct people opened this placement. An AGGREGATE — the rows stay unreadable, so a count can never be turned back into a list of who. Not an impression and not a reach: it counts recorded views, and the app cannot see a screen.';

/*
 * The PostgREST computed fields, so a campaign arrives WITH its counts in one
 * request:  promoted_placements?select=id,creative_headline,viewer_count
 *
 * Each delegates to the uuid function above, so there is exactly one definition
 * of what a view is and these cannot drift from it — the arrangement
 * `follower_count` uses.
 *
 * THESE ARE ALSO WHERE A MEASURED ZERO COMES FROM. `count(*)` over no rows
 * returns 0, not NULL, and every visible placement has one of these whether
 * anybody has seen it or not. So a brand new campaign reads "0 people", never a
 * blank and never an em dash — this app reserves the em dash strictly for "not
 * measured", and a campaign that has genuinely been seen by nobody has been
 * measured.
 */
create or replace function public.viewer_count(p public.promoted_placements)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.promoted_viewer_count(p.id);
$$;

create or replace function public.dismissal_count(p public.promoted_placements)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.promoted_dismissal_count(p.id);
$$;

revoke all on function public.viewer_count(public.promoted_placements) from public, anon;
revoke all on function public.dismissal_count(public.promoted_placements) from public, anon;
grant execute on function public.viewer_count(public.promoted_placements) to authenticated;
grant execute on function public.dismissal_count(public.promoted_placements) to authenticated;

/*
 * `security_invoker = on`, for the reason set out at length above: the ROWS
 * come through the caller's own `promoted_select`, so this view can never show
 * a company a campaign it could not already read. The `where` narrows that
 * further to the people whose campaign it is.
 *
 * Dropped rather than replaced: `create or replace view` refuses a changed
 * column list, and this file must survive being edited and re-run.
 */
drop view if exists public.promoted_placement_stats;
create view public.promoted_placement_stats
  with (security_invoker = on) as
  select
    p.id                                   as placement_id,
    p.company_id                           as company_id,
    public.promoted_viewer_count(p.id)     as viewers,
    public.promoted_dismissal_count(p.id)  as dismissals
  from public.promoted_placements p
  where public.is_company_member(p.company_id) or public.is_staff();

comment on view public.promoted_placement_stats is
  'Distinct people who opened, and who closed, each placement. Counts only: no profile ids and no timestamps, so there is no column here that a join could turn back into who saw what and when. One row per placement the caller''s own RLS already allows them to read.';

/* ==========================================================================
 * Table privileges — a policy permits, a grant makes the privilege exist
 *
 * Revoked from `anon, authenticated` BY NAME rather than from `public`: default
 * privileges grant `public`, so revoking only from it leaves anon holding
 * access.
 *
 * READ WHAT IS ABSENT BELOW, IT IS THE FEATURE:
 *   - no UPDATE on either table: a view cannot be edited into a different
 *     person's view, and a dismissal cannot be re-dated.
 *   - no DELETE on either table: a view cannot be un-counted, and a dismissed
 *     placement cannot come back.
 *   - nothing at all for `anon`: promotions are a signed-in surface, and an
 *     anonymous view could not be a distinct person anyway.
 * ========================================================================== */

revoke all on public.promoted_placement_views from anon, authenticated;
revoke all on public.promoted_dismissals from anon, authenticated;
revoke all on public.promoted_placement_stats from anon, authenticated;

grant select, insert on public.promoted_placement_views to authenticated;
grant select, insert on public.promoted_dismissals to authenticated;
grant select on public.promoted_placement_stats to authenticated;

/* ==========================================================================
 * Tell PostgREST
 *
 * The schema cache is reloaded on DDL by the platform, but not reliably when a
 * migration is applied out of band — and the computed fields above are invisible
 * to a stale cache, which looks exactly like a failed migration.
 * ========================================================================== */

notify pgrst, 'reload schema';
