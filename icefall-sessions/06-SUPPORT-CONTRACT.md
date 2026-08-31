# The support contract — one shape, five apps

> Written by the brain, 2026-08-30. **The database half is built, applied to the
> live project and tested.** This is the contract every app builds against.
> Read `00-CONSTITUTION.md` first.

## What the owner asked for

> "Implement a support system for ICEFALL. So it all connects to Company CRM
> support, so App users - web users, Guides, Expedition Companies. All apps need
> to have support available. that connect and get handled by main app. So if I
> send a message to support via app, I should receive it in the company CRM at
> app users section"

## Why nothing worked before

Support was fully designed and **nobody outside ICEFALL could open a ticket**:

1. `support_tickets_write` required `has_staff_role(['support'])` for *every*
   command including INSERT.
2. `reference` was `not null unique` with no default and no trigger, so even a
   permitted insert failed.

And `icefall-app` shipped a support button that opens the user's mail client
pointing at `support@icefall.app` — a mailbox with nothing behind it.

## The one call every signed-in app makes

```ts
const { data, error } = await supabase.rpc("open_support_ticket", {
  p_subject: subject,          // 1–200 chars
  p_body: body,                // ≥10 chars, else the DB refuses
  p_type: "account",           // account|booking|payment|content|operator|
                               // safety|technical|verification|listing|other
  p_origin_app: "phone_app",   // phone_app|web|guide_app|operator_portal|crm
  p_origin_screen: "/settings",// where they were. Optional, for triage.
});
// → { ok: true, id, reference: "ICE-000107", kind: "athlete" }
```

**There is no argument for who the requester is, deliberately.** The function
derives it from `auth.uid()` — company first, then guide, then staff, then
athlete — and stamps it on the ticket. Verified: a climber cannot pass a kind, and
a direct INSERT is refused by RLS.

`kind` comes back so the app can say *"your question is with the guide desk"*
rather than guessing. **Do not use it to change what the app shows a person
about themselves.**

### Replying, and reading their own thread

Both already work at the database level and need no new function:

```ts
// their thread — internal staff notes are invisible to them, enforced by RLS
await supabase.from("support_ticket_messages")
  .select("body, created_at, author_id").eq("ticket_id", id)
  .order("created_at");

// their reply
await supabase.from("support_ticket_messages")
  .insert({ ticket_id: id, author_id: uid, body, internal: false });
```

**Never send `internal: true` from any app but the CRM.** The policy refuses it
for a non-staff author, but no app should be written as though it might.

## The anonymous case — public web only

A visitor on the public site has no account and cannot get one. They do **not**
go through the RPC. They go to `support_intake`, which is insert-only with **no
select policy** — the waitlist's exact shape:

```
POST /rest/v1/support_intake     apikey: <publishable>
Prefer: return=minimal           ← mandatory; there is no select policy to read back
{ email, name?, subject, body }  ← body 20–4000 chars, enforced by the DB
```

Verified live: a stranger can write, **cannot read back anything anyone wrote**,
and cannot touch `support_tickets` at all. Staff triage intake into real tickets.

`icefall-web` has no Supabase client — copy the waitlist transport
(`api/_waitlist.mjs` → `api/waitlist.js` → `src/lib/waitlist.ts`). It holds the
publishable key only; **a service-role key in that function could read every
ticket and every internal note, so it must never appear there.**

## What each app builds

| App | Where | Origin | Notes |
|---|---|---|---|
| `icefall-app` | Settings → Help. **Delete the `mailto:` first** | `phone_app` | Dark idiom. Keep abuse-reporting separate — that is moderation, not support |
| `icefall-web` | Public contact form | `web` | Anonymous path. Signed-in web uses the RPC once web auth is real |
| `icefall-guide` | Wherever a livelihood question starts — payouts, verification | `guide_app` | Types `verification` and `listing` were added for exactly this |
| `icefall-operator` | Portal help | `operator_portal` | Ticket auto-scopes to their company |
| `icefall-crm` | The desk | `crm` | See below |

## What the CRM needs

1. **Sections by `requester_kind`** — athlete / guide / company / visitor. This
   is the owner's "app users section". No join needed; the column is on the row.
2. **A ticket detail with the conversation, and a reply box.** The CRM can read
   tickets and cannot reply — `queries.ts` has no message function and
   `Support.tsx` has no compose UI. **The database already permits it.**
3. **A `support_intake` queue** and a way to turn one into a ticket.
4. **Undo two lossy translations in `queries.ts`** which discard exactly what
   this feature needs:
   - `type: row.type === "account" ? "other" : row.type` — `account` is where
     most app-user tickets land, and it is being made invisible.
   - `status: row.status.startsWith("waiting") ? "waiting" : row.status` — the
     database separates *waiting on the customer* from *waiting on the company*.
     That distinction is the working state of a support desk.

## `origin_screen` IS TRIAGE, NEVER AUTHORITY — Session 04's correction

`origin_screen` records where somebody was standing so a bug report is
actionable. It is **not** a statement of what they are asking for, and the desk
must never read it as one.

The specific risk, in Session 04's words: if staff start reading *"they were on
/placements, so they want a placement change"*, the operator portal's deliberate
absence of any placement write path **reopens socially rather than technically**.
`canEditPlacement()` returning false unconditionally protects the code; nothing
protects a human inferring intent from a URL.

A ticket saying "please move me to slot 2" is a **message**. It is actioned by a
person through `move_placement`, which writes its audit event in the same
statement. Nothing in support writes to `placements`.

## WHICH APPS CAN SHIP THIS TODAY

`open_support_ticket` derives the requester from `auth.uid()`. An app with no
Supabase auth session has no requester to stamp, so **installing a client is not
enough** — real authentication is a prerequisite, not a follow-up.

| App | Client | Real auth | Support today |
|---|---|---|---|
| `icefall-app` | yes | yes | **yes** — RPC works |
| `icefall-crm` | yes | yes | **yes** — RPC works |
| `icefall-web` | no | no | **yes** — uses the anonymous intake path, which needs neither |
| `icefall-operator` | no | no | **no** — blocked on auth |
| `icefall-guide` | no | no | **no** — blocked on auth |

For the two blocked apps the honest interim is **a screen saying support is not
connected yet, with the direct contact** — never a form. A form that takes a
message, shows a reference and drops it into memory is worse than no button,
because the person believes they have been heard.

## THREE THINGS FOUND BY PROBING THE LIVE DATABASE — inherit these

From the phone-app session, confirmed against the running project rather than
read off the migration. Every app building this form will hit all three.

**0. THE RULE IS NOT "DON'T SHOW `error.message`". IT IS: ONLY REPEAT A MESSAGE
YOUR OWN ENDPOINT WROTE.** — Session 02, and it supersedes the sharper-sounding
version below.

Found in a browser, not in review. With the route missing, the web support form
displayed **"not found"** to the visitor — the dev server's own 404 body,
repeated verbatim, because the client trusted any `error` string it received. An
internal string written for an engineer, in front of somebody asking about
crampons.

`data.error || "fallback"` has this bug everywhere it appears. The fix is a
discriminator the endpoint controls: every response *it* writes carries
`ok: false`; a proxy 404 or a gateway 502 does not, and anything without it gets
the generic sentence. **Known and unfixed:** `joinWaitlist` in
`icefall-web/src/lib/waitlist.ts` has the same shape — unreachable today because
its route always exists, flagged rather than changed on the only live path.

**1. THE SIGNED-OUT ERROR IS A POSTGRES PERMISSION STRING, NOT "not signed in". The signed-out error is a Postgres
permission string, not "not signed in".**

`execute` on `open_support_ticket` is granted to `authenticated` only, so an
unauthenticated call fails **at the grant, before the function body runs** — it
never reaches the `if v_uid is null` check. What comes back is:

    42501  permission denied for function open_support_ticket   (HTTP 401)

That is a *better* boundary than the in-function check, and it means an app that
renders the error verbatim puts "permission denied for function
open_support_ticket" in front of a climber. It reads as a broken app rather than
a signed-out one. **Map it.** `icefall-app/src/auth/account.ts` has a `friendly()`
mapper to copy the shape from — including its rule that an unrecognised message
passes through unchanged, because a wrong-but-friendly string is worse than an
unfamiliar accurate one.

The guide app will hit this exact string the moment it gets a client but before
it gets a session.

**2. `p_type` IS NOT VALIDATED BY THE FUNCTION.** It goes straight into the
INSERT and is caught by `support_tickets_type_check`, so an app offering a value
outside the ten gets a constraint-violation string rather than a usable message.

The ten, in full: `account, booking, payment, content, operator, safety,
technical, verification, listing, other`.

`verification` and `listing` were added by `20260830140000`. **An app reading the
older `crm_trust_support` migration for the list will offer eight and believe it
has them all** — and those two are exactly the guide's commonest problems.

**3. THE LENGTH RULES ARE ASYMMETRIC.** Body is refused below **10 characters**
after trimming; subject is **truncated to 200**, not rejected. Match the body
check client-side at 10, or somebody types "broken" and receives a database
error.

## VERIFYING THE HAPPY PATH IS THE OWNER'S, AND SAY SO

No session can prove a ticket is really created end to end, because that needs a
signed-in account and **entering a password is outside what any of us do**. What
can be proven: the signed-out refusal, the validation, the offline path, and the
removal of the `mailto:`.

So the first genuine `ICE-000107` has to come from the owner signing in once.
Build so that is the only thing missing, and **report it as missing** rather than
folding it into "done".

## Honesty constraints — not negotiable

- **No response-time promise.** Not "we usually reply within 24 hours", not
  "typically a few hours". `first_response_at` exists and is empty; nothing has
  ever been answered. When it has data, the number can be stated.
- **Nothing may look sent that was not stored.** On the AUTHENTICATED path show
  the reference (`ICE-000107`) — it is proof.

  **On the ANONYMOUS path there is no reference and none may be invented.** This
  corrects an error in the first version of this contract, caught by Session 02:
  `Prefer: return=minimal` means nothing comes back, and an intake row is not a
  ticket, so it has no reference to give. A fabricated `ICE-…` would be a receipt
  the visitor could not quote to anybody. A 2xx proves the row was written, so
  "sent" is a true word and is the whole claim.
- **THERE IS NO SUPPORT ADDRESS TO FALL BACK TO.** The first version of this
  contract told blocked apps to show "the direct contact". There is not one:
  `support@icefall.app` appears four times, two of them live `mailto:` links in
  the phone app, and nobody reads that mailbox. The guide-app and web sessions
  refused that sentence independently, within minutes of each other, for the same
  reason — pointing somebody at it builds the defect another session is being
  told to remove. Say the channel does not exist yet, and say what is *not*
  affected. Leave a comment marking where a real address goes.
- **`internal` never reaches a requester.** RLS enforces it; no app should be
  shaped as though it might.
- **Offline: a support form is not a reason to break the phone app.** If the
  request cannot be sent, say so plainly — do not queue it silently and imply
  delivery.
- **Do not ask what kind of user they are.** It is derived. A form that asked
  would be a form somebody could answer wrongly.

## Owners

Schema and RPC: the brain — **done, do not modify**. Each app's surface: that
app's session. The CRM desk: the Company CRM session.
