# 13 — COMPANY CHANNELS CONTRACT

Owner's request, 2026-09-02, verbatim:

> I want expeition companies to have like a Channel where they add promtional
> content that users can join if they want where the expedition company can send
> offers etc but cant reply to the chat + add how many people viewed the message.
> its like on insgaram when creators create channels

Schema is **written and tested** (464/464 green) in
`icefall-supabase/migrations/20260902180000_company_channels.sql`.
**NOT PUSHED** — migrations are the owner's to gate. Build against it; do not push it.

---

## The five rules, and why they are in the database rather than the UI

**1. Members cannot reply — enforced by ABSENCE.**
There is no replies table, no member-writable column, and the only insert policy on
`channel_messages` requires `is_company_admin`. A read-only channel built as "a chat
with the reply box hidden" is one forgotten prop away from being a chat again. If
two-way conversation is ever wanted it is `threads`/`messages` (20260818090000) — a
different feature with a different name. **Do not add a reply affordance, even disabled.**

**2. View counts are COUNTED, not estimated.**
`channel_message_views` holds one row per person per message. The number shown is
distinct people who opened it — a fact the company can stand behind. An incrementing
counter would eventually double-count somebody re-reading, which is exactly the kind
of number ICEFALL does not display.

**3. A count is not a list.**
The company reads `channel_message_stats` (an aggregate view). It **cannot** read
`channel_message_views` rows. A company learning that a named climber opened a named
promotional offer at a named time is surveillance, not analytics, and nobody joining
a channel expects it. Do not build a "who viewed" list — the data deliberately will
not support one.

**4. A company cannot add members.** `channel_members` insert requires
`profile_id = auth.uid()`. You join yourself, you leave yourself. An audience the
company assembled is a mailing list nobody consented to.

**5. Messages cannot be edited.** There is no UPDATE policy on `channel_messages`,
matching `posts`. A promotional claim is stood behind or deleted. Silent edits after
people have read it — and after the view count accrued against the old words — is how
a feed becomes a liability.

---

## Tables

| table | what it is |
|---|---|
| `channels` | company_id, name, description, cover_path, `archived_at`, created_at |
| `channel_members` | channel_id, profile_id, joined_at, `muted` |
| `channel_messages` | channel_id, author_id, body, media_path, media_meta, `product_id`, `departure_id`, `promo_note`, created_at |
| `channel_message_views` | message_id, profile_id, viewed_at |
| `channel_message_stats` | **view**: message_id, channel_id, `views` — read this for the count |

`archived_at` — a channel is archived, never deleted: members joined something and a
company must not be able to make it vanish from under them. Archived stops accepting
messages and stays readable.

### A channel message promotes a PRODUCT. It never carries an offer. — corrected 2026-09-02

This first pointed at `offers` and that was wrong. Three independent reasons, any one
of them fatal:

1. **Shape.** `offers.thread_id` is NOT NULL, there is exactly one `recipient_id`, and
   accepted/declined/withdrawn are mutually exclusive. A broadcast to 1,200 members has
   no thread and cannot be accepted 1,200 times.
2. **Decision 19, in the offers migration itself:** *"a cold offer is a cold call with a
   price on it."* Offers are gated on the customer having opened the conversation.
   A channel offer is precisely the forbidden shape, reintroduced by reference.
3. **Leak.** An existing offer was quoted to one named climber. Broadcasting it shows
   every member the best price that company ever privately gave anyone.

So: `product_id` + `departure_id` (both `on delete restrict` — a product cannot be
deleted out from under a message that already told people about it) + `promo_note`,
free text ≤300 chars for terms in the seller's own words.

**`promo_note` is terms, never a price.** A number there would be an unenforceable
commitment sitting outside the money model. Every real figure belongs to the product,
or to an offer made inside a thread.

**Phone session: do not render an offer card for a channel message.** No company can
legitimately create one. A member who wants a promotion enquires, which opens a thread,
which is where a real offer lives.

Cover images go in the existing `operator-media` bucket, which is already
company-scoped. Message media has no bucket yet — see the blocker below.

---

## Who builds what

**Session 04 — icefall-operator (port 5196).** The company side.
Create a channel; write a message; attach a PRODUCT promotion (never an offer — see above);
see the view count per message
from `channel_message_stats`. Cover upload via `operator-media`.
The view count is the feature the owner asked for — show it plainly, per message.

**Session 01 — icefall-app (phone).** The climber side.
Discover channels on a company's profile; Join / Leave; Mute; read the message list;
record a view (insert into `channel_message_views` — once, on actually seeing it, not
on render of an off-screen list item). **No reply box, not even a disabled one.**

**Session 03 — icefall-crm.** Oversight only. Staff can already read messages
(`is_staff()` in the select policy). A channel is a promotional surface pointed at
climbers, so it needs to be reportable and reviewable the way posts are.

**Brain session (me).** This contract. NOT schema — `icefall-supabase/migrations/`
belongs to Session 03; I wrote three files there on 2026-09-02 before checking, and
they are green but unaudited. New schema goes through Session 03.

---

## Blocker you will hit

**Message media has nowhere to go.** `operator-media` is company-scoped and fine for a
channel COVER. A photo inside a message is the same unresolved question as personal
post media — `20260902160000_post_media_bucket.sql` adds `post-media` for athletes,
not companies. Until that is settled, ship **text + product promotion** messages and
leave media out rather than pointing at a bucket that will reject the write.

## Honesty notes

- A view count of 0 renders as "0 views", never as blank or "—". It is a measured zero.
- Do not show "delivered", "reach", "impressions" or any engagement figure that is not
  literally `count(distinct profile_id)`. There is exactly one real number here.
- Elite Exped is the only REAL company in the data. Do not seed demo channels onto it.


---

## Additions from the other sessions, 2026-09-02

**A disabled control reads as "not built yet" and invites the next person to finish it.**
(icefall-guide.) They had a disabled compose button on Chat; it wasn't unbuilt, it was
*forbidden*, and the risk was someone tidying up an "unfinished" control and asking for
the grant that breaks the rule. If you show anything disabled here, put the reason
**where the control is**, not in a file header.

**A count must not be an affordance.** (icefall-guide.) "12 views" that is clickable,
hoverable, or sits beside a member list implies a drill-down that must never exist.
Plain text, not a control. The operator session is going further and returning a count
from its adapter with no shape that could carry identities — so the UI has no data to
leak even if someone later adds a control. Copy that.

**Oversight gaps being closed by icefall-crm** in `20260902190000_channel_oversight.sql`:
`reports.channel_message_id` (nothing could report a channel message), a staff arm on
the delete policy (a moderation queue whose only outcome is "we looked at it" is not
oversight), and a delete-audit trigger — without which a deleted message takes its
`channel_message_views` history with it and leaves no trace it ever existed.

**Schema ownership:** `icefall-supabase/migrations/` belongs to Session 03 (icefall-crm).
The brain session wrote three files there on 2026-09-02 without checking; they are green
but unaudited. New schema goes through Session 03.

**Guard rule 3 at the TYPE, not the query.** (icefall-web.) RLS stops the company
*reading* view rows, but the rule survives in the product only while nothing hands them
a shape that could carry one. If the type the operator portal reads is `{ views: number }`
and never anything holding a profile id, a future screen **physically cannot** render
"who viewed" — the surveillance version stops being one careless join away. Session 02
made the same move for enquiries (anon has INSERT and no SELECT, so the web literally
cannot read back a state it must not claim) and it has held all week under pressure to
show "seen". Do this in every adapter that touches view counts.

**"Elite Exped is the only real company" is a PER-SURFACE rule, not a data rule.**
(icefall-web.) They were caught once fixing the company card and leaving the same real
name in a second component. If demo channels are ever seeded, grep every surface that
names a company, not only the one being edited.

**The web is deliberately out of scope, and that is not a gap.** (icefall-web.)
Publicly the site is the waitlist and only the waitlist; the marketplace and company
profiles are behind `/preview` (dev-only) and `/app/*` (real session). There is no
public surface where a promotional channel could appear. When the marketplace opens,
a channel on a company profile becomes a real web question and Session 02 takes it then,
against this same schema.
