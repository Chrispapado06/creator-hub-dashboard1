# Request 11 → Session 03 (schema owner): a stored owner tier, and somewhere to keep a granted permission

**From:** Session 04 (`icefall-operator/`)
**Date:** 2026-08-31
**Blocks:** the second half of `OP-08`. The first half shipped without you — see
§3 for exactly what it does and does not claim. This asks you to make it real.

---

## 1. The owner's words

> Super Admin should Have option to manage staff so give him more permissions
> like create offers etc . + male invote member work so when they get email they
> can create their account

Two asks. The second one — invite by email, they create an account — is not a
schema question and is **not in this request**; it needs authentication this app
does not have (§5). This is about the first: a top account that holds more than
a Company Admin and can pass some of it on.

---

## 2. What exists today

`CompanyRole` is two values and the comment says why:

```ts
/**
 * Two roles. That is the whole permission model (spec §3), and the union cannot
 * express a third, so it cannot grow one by accident.
 */
export type CompanyRole = "admin" | "sales";   // types.ts:71
```

`PERMISSIONS` in `src/domain/authz.ts` is a switch over those two. There is no
owner column, no grants column, and `OperatorBackend` has no method that writes
a role or a permission at all — `inviteTeamMember` sets the role once at invite
and `setTeamMemberStatus` changes only `active` / `invited` / `disabled`.

---

## 3. What I built, and the seam I left for you

I did **not** add a third role value. The comment above is still right, and a
third value would have to be written by the invite path, stored by a schema with
no room for it, and understood by every screen that switches on the role.

Instead I read a fact the data **already carries**. `company_users.invited_by` is
null on exactly one account per company — the one ICEFALL created when the
company was taken on. Everybody else was invited by somebody:

```ts
export function isOwnerAccount(user: CompanyUser): boolean {   // authz.ts:167
  return user.role === "admin" && user.invitedBy === null;
}
```

On that sit two things:

```ts
export const GRANTABLE_PERMISSIONS = ["createOffers"] as const;

createOffers: (s) => isCompanyOwner(s) || hasGrant(s, "createOffers"),

/** TODAY, ALWAYS NOTHING. The one function that changes when the column lands. */
export function grantedPermissions(user: CompanyUser): readonly GrantablePermission[] {
  return [];
}
```

`src/screens/Team.tsx` labels the founding account "Account owner", explains the
three tiers in prose, and says plainly that handing the permission to somebody
else is **not available**, rather than showing a switch that forgets. Nothing in
the portal shows a granted permission that is not granted.

### What is wrong with this, and why I stopped here

**`isOwnerAccount` has no server-side twin.** Every other predicate in
`authz.ts` mirrors a SECURITY DEFINER function one for one, and the file's header
is explicit that a second, cleverer definition in the client is a second answer
to the same question. This one has no first answer to mirror. So I confined it
to labelling, explaining, and gating `createOffers` — **a permission the backend
does not implement at all yet**, so there is no write it can be wrong about. I
did not use it to guard `setTeamMemberStatus` or anything else the database
already rules on. See §4 for the one place that restraint costs something.

---

## 4. A hole I found and deliberately did not paper over

`setTeamMemberStatus` gates on `manageStaff` — i.e. **any** Company Admin — plus
a self-guard (`"You cannot disable your own account."`).

**So a Company Admin who was invited last week can disable the founding
account.** Nothing in the schema or the client prevents it. The seed has one
admin per company so it cannot be demonstrated there, but the rule permits it.

I could have blocked it in `Team.tsx` in three lines. I did not, on purpose: a
client-only guard would describe a rule nobody enforces, and the first person to
find out would be an operator watching the database allow what the portal said
was impossible. **This is yours to fix, in the policy.**

---

## 5. What I am asking for

### 5.1 A stored owner flag — `company_users.is_owner boolean not null default false`

Exactly one true per company (`unique (company_id) where is_owner`), set when
ICEFALL creates the company, never writable by an operator.

Then `is_company_owner(company_id)` as a SECURITY DEFINER function beside
`is_company_admin`, and I replace `isOwnerAccount`'s body with a read of the
column — one line, one file, and the mirror is restored.

**Why a column rather than keeping the derivation:** `invited_by IS NULL` is true
today by accident of how rows are made, not by anybody's decision. A support
script that recreates a row, a company handed over to a new owner, a second
founding admin — any of those and the portal silently changes its mind about who
runs the company. It is the right *reading* of today's data and the wrong thing
to build a permission on.

### 5.2 Somewhere to keep a granted permission

The smallest thing that works:

```sql
create table company_user_grants (
  company_user_id uuid not null references company_users(id) on delete cascade,
  permission      text not null check (permission in ('create_offers')),
  granted_by      uuid not null references company_users(id),
  granted_at      timestamptz not null default now(),
  primary key (company_user_id, permission)
);
```

with `grant_company_permission(company_user_id, permission)` and
`revoke_company_permission(...)`, both refusing unless the caller
`is_company_owner()` of that member's company, and both writing an audit event —
"who may commit this company to a price" is exactly the kind of change that
should not be a bare UPDATE.

**Please keep `permission` a CHECK-constrained enum, not free text.** The list is
meant to be short and to grow by hand. Spec §13's "no enterprise permission
builder" is still the rule; this is a named exception the owner asked for, not
the start of a matrix. `GRANTABLE_PERMISSIONS` in `authz.ts` is the closed client
mirror of that CHECK list.

Then `grantedPermissions()` reads the rows and the Team screen's "not available
yet" notice becomes a grant control. Nothing else in the portal changes.

### 5.3 A decision I need from the product owner, not from you

**Should a Company Admin hold `createOffers` by default, or only the owner and
whoever the owner grants it to?**

I built owner-only. A custom offer is a price the company will honour for one
customer, outside the published range — a commitment rather than content — and
quietly adding that to what "Company Admin" already means would change what every
existing admin may do without anyone deciding it. But it is a product call and I
would rather it were made than inherited from my caution. The answer is one line
in `PERMISSIONS`.

Note also that `createOffers` **has no caller yet**. The offer builder is
`OP-05`'s work, and Session 05 has already filed the shape both apps should share
in `requests/07-custom-offer-shape.md` (the `Quote` type from
`icefall-shared/money.ts`, `passThrough` set per line, the operator's commission
on the referral basis rather than the guide's). **That request answers "what an
offer is"; this one answers "who may make one".** They should land together, and
neither should be built without the other.

---

## 6. Not in this request: invite by email

The owner's second sentence — "when they get email they can create their
account" — is **BLOCKED, and not on the schema.** This app has no
authentication: sign-in is `listSignInIdentities()`, a picker over seeded rows,
with no password field "because there is no authentication here to imitate"
(`src/screens/SignIn.tsx`). There is no auth provider wired, no mail transport,
and no self-registration path — spec §13 says operator accounts are created by
ICEFALL, so a sign-up flow is itself a product decision.

I left the invite behaviour exactly as it was and made the copy stop implying a
message goes out: the button reads **Add to team**, the panel carries "This does
not send an email", and the confirmation says the person is on the list as
Invited and that ICEFALL must give them access. An invite button that appears to
send and sends nothing is the failure the constitution is written against.

When the auth decision lands, this becomes: an auth provider, an invitation token
with an expiry, a transactional mail path, and a first-sign-in flow that binds
the new account to the existing `company_users` row. That is a project, not a
column, and it should be scoped as one.

— Session 04
