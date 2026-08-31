# Verification and agreement records — the shared contract

**Owner rulings, 2026-08-31.** Three answers, two of which create records that
somebody may one day rely on in a dispute, an insurance claim, or an inquest.

    1. Guide document checking      -> YES, build it
    2. The phone app's START button -> KEEP. Not a decision, an artefact of a drawing.
    3. Recording what a customer agreed to -> YES, build it

Items 1 and 3 are not ordinary features. **They are the two places where ICEFALL
starts making assertions that outlive the screen they appear on.** The rules below
exist so that neither becomes a checkbox.

---

## 1. GUIDE VERIFICATION

### What the owner has agreed to, stated precisely

ICEFALL will **read guides' certification documents and record that it did so.**
That is all. It is not an attestation by IFMGA, UIAGM or any national association,
and the product must never imply that it is.

**The honest sentence already exists in the code and survives unchanged:**

> Documents checked by ICEFALL on 31 May 2026. We have not contacted the issuing
> association.

Do not "improve" it into "Verified guide". The distinction between *we read the
papers* and *the federation confirmed them* is the whole of ICEFALL's exposure here.

### The constraint that must be lifted, and why it was there

`guide_profiles.credentials_verified` is `not null default false
check (credentials_verified = false)` (`20260817120000_icefall_foundation.sql:126`).
**It was written so that no code path, no admin screen and no stray update could
ever claim a guide was verified while no checking process existed.** It did its job.

**Lifting it is now correct — and it must be replaced, not simply dropped.**
A boolean that anyone with CRM access can flip is a worse state than the one we are
leaving. The replacement:

- **`checked_by`** — the staff member who read the documents. Not nullable when
  verified. A verification with no name attached is an anonymous assertion.
- **`checked_at`** — when. Not nullable when verified.
- **`document_ref`** — which document was read.
- **`expires_at`** — the certificate's own expiry, from the document.
- **Set only through a `SECURITY DEFINER` function that writes an audit event.**
  No direct UPDATE grant on the column, the same enforcement-by-absence Session 03
  used for `enquiries`. The test that proves it is a *refused* direct update.

### Expiry is not a display concern

**An expired certificate must stop the claim automatically.** Derive the displayed
state from `expires_at` against the current date — never from a stored boolean that
somebody has to remember to clear.

This project has already shipped this bug once: an admin screen compared display
strings like `"31 Dec 2028"`, parsed them a day early, and treated anything
unparseable as *not* expired — so **lapsed insurance rendered as valid.** A safety
check that fails open is worse than no check, because it is trusted.

### What each app shows

- **CRM** — the queue of documents to check, and the act of recording a check.
- **Guide app** — the guide's own status, what was checked, when it expires, and
  warning before it does.
- **Phone app / web** — the honest sentence above, with the date. Gold treatment is
  ICEFALL's own mark. **No federation roundel** (ruled 2026-08-31): a real
  association's trademark implies that association attested to something.

---

## 3. WHAT THE CUSTOMER AGREED TO

### The record is worthless unless it pins the exact text

The failure mode is a boolean: `terms_accepted = true`. **In a dispute that proves
nothing**, because the terms have changed since and nobody can say what the customer
saw. The record must capture, immutably:

- **The exact terms, by version or by stored text** — what was on the screen at that
  moment, not a pointer to whatever the policy says today.
- **The cancellation policy as it stood.** The owner's own mockup heads this
  *"(AGREED AT TIME OF BOOKING)"* — that is rate-preservation, in their handwriting,
  and it is the requirement.
- **What was disclosed.** Their mockup lists difficulty, maximum altitude, what is
  included and not, and **emergency evacuation not included.** Those are material
  facts about a trip that can kill somebody. Store what was shown.
- **When, and by whom.**

### Immutable, including to staff

Written once at booking, never edited afterwards — enforced by trigger, not by
convention, and not exempting staff. Session 03 already applied exactly this shape to
`enquiries` so the customer's own words cannot be altered. Same argument, higher
stakes: **this is the record that answers "what were they told?" when somebody is
hurt.**

### Do not back-fill

Existing bookings have no acceptance record because none was captured. **Render that
absence honestly** — "not recorded" — rather than assuming the current terms applied.
A fabricated agreement record is worse than a missing one.

---

## 2. THE START BUTTON — KEEP IT

The phone app's bottom navigation stays: **Home · Explore · START · Coach · Profile.**

The mockup's `Plan · Train · Explore · Guides · Profile` removed the one-tap route
into recording an activity. **The generating AI had no way to know START was the
centre of the app**, and the owner has confirmed it was not a decision. §6ad: a
mockup's chrome is unreliable; its content is signal.
