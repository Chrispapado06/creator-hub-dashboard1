# Every signup/onboarding question must be answered — owner, 2026-09-01

Owner: *"all questions when made account need to be filled in"*, alongside
confirming that phone/web/guide are one account and username theft is
impossible (both verified: same Supabase project; DB-level unique index on a
canonically-lowercased handle, shape CHECK blocking `_alex`/`alex.`/`a..lex`,
reserved list, `claim_username()` decides — the app check is courtesy only).

## The rule

Onboarding is already gated (`nextStepForSession` → "onboarding" until
`onboarded_at`; `canAdvance` on Next). What changes: **no question may be
optional.** Today several are — `Onboarding.tsx:851` "Choosing nothing is
allowed", `:1227` "All optional. Weight is the one that changes anything
today", `:1572`.

## The distinction that must survive

**Required-to-ANSWER is not required-to-HAVE-A-VALUE.** Every question gets an
answer; some answers are legitimately "none". A beginner asked which peaks they
have summited must be able to say **"None yet"** as a real selectable option —
forcing them to name a mountain manufactures a false climbing history, and this
product puts people on glaciers partly on what they declare.

- No skipping. Next disabled until answered.
- Where "nothing" is truthful, ship it as an EXPLICIT option ("None yet",
  "Prefer not to say", "Not sure"), stored as that answer — never as an empty
  field indistinguishable from unanswered (§6ag: absent and "none" must not
  collapse).
- **Weight becomes genuinely required.** When it does, the calorie caveat
  ("est. for an assumed 72 kg") must stop appearing for anyone onboarded after
  the change — verify it drops once a real weight exists.
- Questions that "drop out if they don't apply" (`:1333`) stay conditional: a
  question the app chose not to ask is not a question the person skipped.

## Both flows, one shape

Phone (Session 01) and web signup (Session 02) must land on the IDENTICAL
answer set, options and storage shape — it is the same account either way, and
a person who signs up on web must not be re-asked on the phone. §6u: once
deliberately identical, a unilateral improvement in one is a regression.
Coordinate directly; do not each invent an answer set.
