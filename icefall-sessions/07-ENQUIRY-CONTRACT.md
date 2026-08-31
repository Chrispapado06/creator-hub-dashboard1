# Enquiries — the shared contract

**Owner ruling, 2026-08-31.** Asked where an enquiry should land given ICEFALL has
no operator partnerships, the owner chose: **into the Company CRM as an inbound
queue.** ICEFALL staff answer. Operator delivery comes later, when there are real
operators to deliver to.

This is what makes the Send button honest, and it is why **D1's carve-out resolves
itself**: once an enquiry genuinely arrives somewhere, *"nothing you write is
transmitted and no reply will arrive"* stops being true and comes down. **Not
before.** The notice is removed in the same change that makes sending real, per app.

### The removal rule is narrower than it first read — corrected 2026-08-31

My original wording — "remove the transmission notice in the same change" — assumed
**one send path per app**, and Session 02 showed that is false. `icefall-web` has two
surfaces that look alike:

- the **enquiry** path, which is becoming real, and
- the **Messages composer**, whose control reads *"Keep on this device"* beside
  *"Nothing sends. Text stays in this browser, readable only by you."*

**Making enquiries land in the CRM does not create a message server.** The composer
still does not send, still stores locally, and its notice stays TRUE. A session
applying the rule mechanically would delete a correct sentence about a different
feature and leave the app lying about threads.

**So the rule is: amend only the sentence that became false.** Check what each notice
is about, not what it resembles. This is the same discipline as the copy sweep that
kept eight of eight sentences because each was about a capability that still did not
exist.

Session 02 also notes their tree has **no D1 notice to remove at all** on the enquiry
path — it never made a Send claim, because the button was called "Keep on this
device". An interface that states its limits through what a control is *called*
needs no apology underneath it, and has nothing to retract when the limit lifts.

## Copy the support system; do not invent a second shape

`06-SUPPORT-CONTRACT.md` already solved this problem — an anonymous or signed-in
person writes, it lands in the CRM, segmented by who they are, with the requester
kind **derived server-side and never accepted from a client**. An enquiry is the
same shape with a different lifecycle.

**Differences that matter:** a support ticket is a problem to resolve; an enquiry is
a commercial lead with an object attached (a trip, a mountain, a trek, a company). It
belongs beside Leads and Pipeline in the CRM, not beside Support.

## The rules

1. **The sender is derived, never sent.** Same as `open_support_ticket`. A client
   cannot claim to be someone else, and cannot set which company it is "from".

2. **An enquiry names its object.** Which trip, mountain, trek or company. An
   enquiry with no object is a support message and belongs in the other queue.

3. **NEVER STATE A RESPONSE TIME.** There is a standing defect on four customer-
   facing screens — *"Replies within {n} h"* — which is invented and uncaveated. Do
   not reproduce it here. The app may say an enquiry was received and by whom. It
   may not promise when anybody will answer, because nothing measures that.

4. **The sender can see their own enquiry and its real state.** Sent, seen,
   answered — only states something actually records. Do not render a status the
   database cannot substantiate.

5. **Anonymous enquiries follow the support precedent**: write-only for `anon`,
   readable by staff. Note the support table's grant/policy pair — a policy permits,
   a GRANT makes the privilege exist, and both are required (§6v).

6. **No deletion path is not acceptable here.** `support_intake` has no delete
   policy for any role, which is an open problem the owner has been asked about.
   Do not repeat it: decide retention when the table is written.

## The schema exists — build against it, do not design a second one

`icefall-supabase/migrations/20260831110000_enquiries.sql` (Session 03) is written.

    open_enquiry(
      p_body           text,
      p_product_id     uuid default null,
      p_destination_id text default null,
      p_company_id     uuid default null,
      p_origin_app     text default 'phone_app',
      p_origin_screen  text default null
    )

**How the object is expressed — answered.** Three nullable foreign keys, with a
CHECK that at least one is set. Real referential integrity, not a polymorphic
`(kind, id)` pair. Mountains and treks are NOT tables; they resolve through
`destinations`, which is why `p_destination_id` is `text`.

**And `object_label` is stored alongside** — the object's name at the time of
writing. The foreign keys are `on delete set null`, so without the label a deleted
product would turn an old enquiry into "about nothing". The trail outlives the
referent.

**The anonymous path must use `Prefer: return=minimal`.** `insert … returning` FAILS
for `anon` — it has no select privilege, by design. This is the same mechanic that
produced a false "the support form is broken" alarm (§6v), resurfacing here as a
mechanical necessity rather than a diagnostic trap. Ask for nothing back.

**`authenticated` has NO insert grant at all**, deliberately: the absence forces the
function path rather than a policy merely discouraging a direct write. The test that
proves the boundary is a **refused direct insert**, not a successful real row.

**CLIENTS MUST NOT SEND `object_label` AT ALL.** A `BEFORE INSERT` trigger on the
table resolves it from the referenced record on **every** path, so whatever a client
sends is overwritten. Sending it anyway only invites the next reader to believe it
matters. Verified as anon: a label reading "FREE HELICOPTER RIDES CLICK HERE" against
a real destination comes back as the record's own name; a mismatched `company_id` on
a product enquiry is corrected to the product's actual owner; a nonexistent object is
refused outright.

**Anonymous enquiries ARE in scope.** `anon` may insert, forced to the visitor shape
with an email present; only staff read. Grants and policies are both present (§6v).
A super admin may delete and the trigger writes the trace — the `support_intake`
retention hole is not repeated.

## RULED 2026-08-31 — a company enquiry WAITS; it does not fall back

`icefall-web`'s companies are invented client-side with slug ids, so `company_id`
cannot resolve and the foreign key refuses the enquiry. **That is the constraint
working, not obstructing.** A fabricated lead in a commercial queue is worse than no
lead.

**Do not fall back to `destination_id` when a visitor enquires from a company page.**
A person who clicks "enquire about Solukhumbu Expeditions" and produces a lead
reading "asked about Everest" has had their question silently changed into a
different one, and staff would answer the wrong thing. Worse, it launders an
invented company into a real queue entry — the exact failure the FK prevents.

**Leave the company button as it is.** It becomes buildable when companies are real
rows, and not before. Build the two surfaces that CAN name a real object.

## OPEN DEFECT for Session 03 — `object_label` is guaranteed on one path only

`open_enquiry` resolves `object_label` from the record, and its comment states the
guarantee: *"THE OBJECT IS RESOLVED, NOT TRUSTED… so a client cannot file an enquiry
'about' something it is not."*

**The anon insert policy does not constrain `object_label` at all.** It checks only
`sender_id is null and sender_kind = 'visitor' and sender_email is not null`. So an
anonymous client may attach a real `destination_id` and any label it chooses, and the
CRM renders that label to staff. **The protection the function is careful about is
absent from the path anonymous visitors actually use** — which is the only path the
public web app has.

A comment that states a guarantee holding on one write path and not the other is
worse than no comment: it tells the next reader the queue can be trusted. Fix before
the push; it is free now and a migration later.

## Who builds what

- **Database** — one table, one `SECURITY DEFINER` function, RLS, grants. Written as
  a migration. It needs the owner to push it; nothing works until they do.
- **Company CRM (03)** — the inbound queue. **This also answers D2**: the Leads page
  becomes "who is waiting on us right now", ranked by wait, unanswered first.
- **Phone app (01)** — Send becomes real. Remove the transmission notice in the same
  change, and only in that change.
- **Web app (02)** — same, on the marketplace enquiry path.
- **Operator portal (04)** — nothing yet. Delivery to operators is the later phase;
  do not build a half of it now.

## What does NOT change

The other two D1 notices — *"ICEFALL does not vet operators"* and *"sample listings,
not real companies"* — are moving to the Privacy Policy and T&Cs by the owner's
earlier ruling. They are unrelated to this and must not be removed as part of it.
