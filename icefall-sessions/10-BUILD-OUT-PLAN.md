# The build-out — everything functional, ahead of the 30-day design pass

**Owner instruction, 2026-08-31:** *"build everything out, and on the 30 days i will
be redesigning them, you already know how i like my designs."*

So: FUNCTION-COMPLETE pages now, in the established design language (climber apps:
dark, azure accent, hairlines, Inter Tight; CRM: white canvas, gold actions, Plus
Jakarta Sans; badges per D4/§6ai). The owner redesigns screen by screen during the
30 days; layouts will change, functions must not have to.

**Standing rules unchanged:** §6z ticking, honesty doctrine (no invented figures on
real surfaces; demo literals stay flag-gated), the three locked rulings, 15% from
the constant, pixels outrank prose when mockups arrive. Do not commit or push.

---

## THE FOUR SHARED SYSTEMS (contracts below; cross-app pieces build against these,
## never invented per-tree)

### S1 — MESSAGING (real, at last)
`threads`, `messages`, `thread_participants` already exist in the live schema.
- CRM session owns any needed migration (send function, RLS audit, read receipts as
  timestamps not booleans).
- Phone: Messages + Thread read/write real threads. The "held on this device" copy
  comes down thread-by-thread ONLY where sending is real (amend the sentence that
  became false).
- Guide: chat becomes real; **GU-03b unblocks** — the composed offer SENDS.
- Operator: Leads conversations converge on the same tables.
- A climber messaging a company/guide = a thread. Enquiries stay separate (they are
  leads with objects; threads are conversations).

### S2 — SOCIAL (one shape, three apps)
- Tables: `posts` (author = profile | company | guide; media; caption; optional
  expiry = a story), `post_comments`, `follows`, `promoted_placements`.
- Feed = accounts you follow, **chronological**. No algorithmic-ranking claims.
- Phone (PH-08): feed, composer (share an activity per PH-18 — auto-post for
  ID-verified users only, grey-mark gate), comments, follow/unfollow.
- Operator (OP-01): company profile posts + promotional video slot.
- Guide: profile posts (same tables, author kind = guide).
- CRM (CR-17): moderation queue + the promotion builder — targeting by DECLARED
  mountain goals only, country filter, premium members never see promotions,
  audience counts are real account counts, no reach/impression forecasts ever.
- Promoted items in feeds are ALWAYS labelled "Promoted".

### S3 — AUTH EVERYWHERE (same accounts as the phone app)
- Web: real Supabase sign-in (email + Google/Apple/Microsoft), the signed-in shell
  moves from DEV-gate to auth-gate. Waitlist stays the public face until launch.
- Operator portal: sign-in via `company_users` membership; roles per OP-08a.
- Guide app: sign-in as the guide (`guide_profiles.id = auth.uid()`).
- OP-08b email invites remain blocked on the email-provider decision (owner's).

### S4 — ENQUIRIES PHASE 2
- "My enquiries" on phone + web signed-in: sender reads their own rows — sent /
  seen / answered, real states only (rule 4 made visible).
- Operator delivery: an operator sees enquiries naming THEIR company/products
  (new RLS view; CRM stays the desk of record). CRM gains a "hand off to operator"
  action stamped on the row.

---

## PER APP

**Phone (01):** finish PH-01 flow (Summary = only post-activity page, absorb
replay/share); calories (3) pace+gradient MET; PH-10 Treks page swap; PH-14b coach
suggests real treks; PH-16 CoachProgress build-half; PH-21 Search (guides, people,
companies); PH-22 kill the DEV-only fake level; HR pairing groundwork (settings +
model, no zone claims until paired); S1 phone side; S2 feed/composer/comments;
S4 My enquiries; enquiry send path (in flight).

**Web (02):** S3 auth (the big one); S1 web messages; S4 My enquiries; badge
rendering per D4 (companies: no mark until owner assigns the fourth); company pages
ready to bind to real `companies` rows; keep `/preview` gate until launch decision.

**Operator (04):** S3 sign-in; S1 conversations on shared tables; S4 operator
enquiry inbox; OP-01 via S2; finish OP-05b send (via S1); payouts/analytics wired to
real rows where they exist, honest states where not.

**Guide (05):** S3 sign-in as guide; S1 chat real → GU-03b sends; GU-06c status
screen on live `guide_credentials_state` (in flight); availability on real data;
S2 guide posts.

**CRM (03):** migrations for S1/S2/S4-delivery + `company_treks` (queued) + ID
verification schema (grey mark source); CR-02b analytics set (buildable subset);
CR-06b placements feed to phone/web (requests 09/10); CR-17 promotion builder;
moderation queue; first real document check flow is live — use it.

## Blocked on the owner, listed once
1. **Email provider** (invites, enquiry answer emails, auth emails at scale).
2. **The commit.** Everything above lands on an uncommitted tree until they say go.
