-- ============================================================================
-- Waitlist: marketing consent, recorded with its evidence
--
-- WHY THIS COULD NOT WAIT. `public.waitlist` was email, name, source and a
-- timestamp. Joining a waitlist is a request to be told when something opens;
-- it is NOT permission to send promotions. Those are different permissions and
-- consent to the second has to be specific, unbundled and recorded.
--
-- The window: `select count(*) from waitlist` was 0 when this was written.
-- Nobody had signed up, so nothing had been collected without consent and this
-- is a clean addition rather than a cleanup. It stops being fixable the moment
-- real people join — you cannot email somebody to ask whether they consent to
-- being emailed, so every address collected before this column exists is an
-- address marketing can never use.
--
-- WHAT IS STORED, AND WHY THREE COLUMNS RATHER THAN ONE. A boolean alone is
-- not a record of consent: it says somebody agreed, not WHEN or TO WHAT. If the
-- sentence on the page changes next month, a lone `true` no longer tells anyone
-- what the person actually agreed to. So the row carries the tick, the moment,
-- and the exact wording that was on screen at the time.
-- ============================================================================

/*
  THREE STATES, NOT TWO. THE COLUMN IS DELIBERATELY NULLABLE.

    true   granted  — they ticked the box
    false  declined — they were shown the box and did not tick it
    null   never asked — they signed up before the box existed

  `not null default false` would collapse the last two into one, and the
  difference is the whole point: a person who was never asked MAY be asked
  again, and a person who declined MUST NOT be. Flattening them at the source
  destroys that distinction permanently — no later migration can tell which of
  the two a `false` was, because the information was never written down.

  (Nobody has signed up yet, so `null` should describe no one. It exists so the
  schema is still correct if that turns out to be wrong, and so a row inserted
  by any future caller that does not ask cannot masquerade as a refusal.)
*/
alter table public.waitlist
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_text text;

comment on column public.waitlist.marketing_consent is
  'true = ticked an unticked-by-default box. false = shown it and declined. null = never asked. Joining the waitlist is never itself consent to marketing.';
comment on column public.waitlist.marketing_consent_at is
  'When they ticked it. Null where they did not.';
comment on column public.waitlist.marketing_consent_text is
  'The exact sentence shown beside the box, stored verbatim so a later change to the copy cannot rewrite what somebody agreed to.';

/*
  CONSENT CANNOT EXIST WITHOUT ITS EVIDENCE.

  Enforced here rather than in the API, because the API is one caller and this
  is the kind of claim that must not survive a careless second one. A row
  asserting `marketing_consent = true` with no timestamp and no wording is a
  claim nobody can substantiate later, which is exactly what an audit asks for.
*/
alter table public.waitlist
  drop constraint if exists waitlist_consent_evidence;

alter table public.waitlist
  add constraint waitlist_consent_evidence check (
    marketing_consent is not true
    or (
      marketing_consent_at is not null
      and marketing_consent_text is not null
      and char_length(btrim(marketing_consent_text)) between 10 and 500
    )
  );
