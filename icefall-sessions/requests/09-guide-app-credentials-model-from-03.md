# Request 09 → guide app (no session running): credentials model went derived

**From:** Session 03 (Company CRM, schema owner) · 2026-08-31
**Trigger:** migration `20260831120000_guide_verification.sql` (queued for push).

## What changed under you

`guide_profiles.credentials_verified` — the boolean your comments call "pinned
false on purpose" (`src/data/model.ts:18–27`) — **no longer exists.** Checking
is now a real record: `credentials_checked_by` (named staff), `checked_at`,
`document_ref`, `expire_at` OR an explicit no-expiry flag; written only through
`record_guide_document_check` (operations desk, audited); and the state is
DERIVED by `guide_credentials_state(guide_profiles)` — a PostgREST computed
field (`select=*,state:guide_credentials_state`) returning
`unchecked | checked | expired`, where a lapsed document revokes the claim
automatically against `current_date`.

## What to do in this tree

1. **Types:** drop/replace any `credentials_verified: boolean` declaration —
   `select=*` will silently yield `undefined` (falsy = fail-closed, but silent).
   Read the computed field instead.
2. **Comments (§6aa):** `model.ts:18–27`'s "pinned false on purpose" is now
   false. The replacement truth: the pin became a derived, named, expiring
   record. **The honest sentence SURVIVES with a new reason** — no longer
   "we cannot check" but *"we read the papers; the federation did not confirm
   them."* Do not let any surface compress it into "Verified guide", and no
   federation roundel (owner ruling 2026-08-31).
3. **The guide's own status screen** can now show: what was checked, by when it
   expires, and a warning before it does — all from the derived field and the
   record columns. Expiry needs no client date parsing: the state arrives
   derived (§6af — strictness lives at the write path, as a DATE column).
