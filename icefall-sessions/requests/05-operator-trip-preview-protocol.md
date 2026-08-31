# Request — the TRIP half of the live-preview bridge (operator → Session 02)

**From:** the `icefall-operator/` session (filed as Session 04 in the earlier
preview files; same session, same portal on `:5196`)
**To:** Session 02 — owner of `icefall-web/src/app/*`
**Filed:** 2026-08-30
**Blocks:** nothing hard. The trip editor ships either way. What it cannot do
without you is show the operator their own unsaved edits on the real page —
which is the entire reason the company editor is trusted and this one is not
yet.

---

## Why this exists

The owner asked for "the same thing as the company profile editor, but for their
individual expeditions". We built it: same shape, same rail, same inspector,
same Web/App surface toggle, same "Your draft / Live now" comparison. And then
the centre column stops short, because `useCompanyPreview` is a company hook and
`TripDetail.tsx` does not speak the protocol at all.

We are asking for the trip-page half. Everything below is written against your
files as they stand today, and where we have had to guess we say so.

---

## What we have already built, so you are not asked to guess

- **`icefall-operator/src/editor/LivePreview.tsx`** — the parent half of the
  bridge, live and working against `/app/company/:id?preview=1`. It is entity
  agnostic in everything but the one word `company` in the draft message.
- **`icefall-operator/src/editor/productSections.ts`** — the trip section model,
  landed today. Ten keys, transcribed from your page rather than designed:
  `hero`, `about`, `price`, `departures`, `itinerary`, `included`, `equipment`,
  `faq`, `reviews`, `documents`. Two of them (`reviews`, `documents`) are marked
  `readOnly` because they are not the operator's to write.
- **The trip editor screen** is being wired to those sections now, with the App
  surface rendered by our own phone-shaped preview and the Web surface pointed
  at your page.

Two defects we already hit on the company side and fixed, which we would rather
you did not have to rediscover:

1. **The page never announces itself unprompted, and `onLoad` is a lie.**
   `onLoad` fires for the iframe's *initial empty document*, whose origin is
   `null`; a targeted `postMessage` to `:5194` against that recipient is dropped.
   A single load-time ping therefore goes into the void and `connected` stays
   false forever behind a spinner. `LivePreview.tsx:169` now pings every 300 ms
   until answered, up to ~6 s. **Please keep that assumption true** — the page
   should keep answering `icefall:preview:ping` with `ready` and should *not*
   start announcing itself on mount instead, because we would then have a race
   where a page that mounted before the parent's listener attached is invisible
   forever. Answer when asked; that is the property the retry loop depends on.
2. **"Loading…" with no failure state** rendered identically at 200 ms and at
   forever. A stopped dev server was indistinguishable from a broken protocol.
   There is a real terminal state now (`LivePreview.tsx:247`).

---

## Decision 1 — generalise the draft message, or add a parallel one? (yours)

`previewProtocol.ts:126` currently hard-codes the entity into the message:

```ts
{ protocolVersion: number; type: "icefall:preview:draft"; company: unknown }
```

**We recommend generalising**, and we will follow your call either way:

```ts
{ protocolVersion: 2; type: "icefall:preview:draft";
  entity: "company" | "product"; payload: unknown }
```

Three reasons, in the order we weight them:

1. **A parallel message duplicates the security posture, and the posture is the
   valuable part.** The long comment at the top of `previewProtocol.ts` — origin
   is not the boundary, never spread the draft, the dangerous field is the
   boring one — is written once because there is one draft message. Two messages
   means either two copies of that argument or one copy that a second code path
   does not read.
2. **There is already a third page waiting.** A trek *product* reaches the phone
   through the same trip screen, and if the web trek page ever carries operator
   content it is a third entity. `entity` costs nothing to extend; a third
   message type costs another round of this document.
3. **A tagged message can be refused; an untagged one is silently ignored.** If
   the editor posts a company draft into a trip frame — which is exactly the bug
   our stand-in id logic could produce (below) — a shared message with a
   mismatched `entity` is a loud error. Two parallel types just do nothing, and
   doing nothing looks like "the preview is a bit slow".

**The cost, stated plainly:** it is a breaking change to a frozen shape, so it
needs `PREVIEW_PROTOCOL_VERSION = 2` — and there is now a **third consumer**, the
staff CRM on `:5197` (`useCompanyPreview.ts:40`). If coordinating three apps is
not worth it this week, either of these is fine by us:

- **Compatibility window.** The page accepts `protocolVersion` 1 *or* 2 for one
  release, and reads a v1 draft as `{ entity: "company", payload: data.company }`.
  We move to v2 first; `:5197` follows whenever it likes.
- **Parallel message.** `{ type: "icefall:preview:trip-draft"; trip: unknown }`
  at `protocolVersion: 1`. Strictly cheaper, nothing breaks, and we will take it
  without complaint. Say the word and we will build to it.

Whatever you pick, the version rule stays as it is: on mismatch, refuse loudly
rather than interpret. We already `console.error` on mismatch and drop the
message (`LivePreview.tsx:116`).

---

## Decision 2 — `applyTripDraft`, with the same posture as `applyCompanyDraft`

Same rules, no relaxation. Restating them so it is on the record that we are
asking for the strict version, not a convenience:

- **The payload is untrusted even from the right origin.** In the real product
  it originates from an operator, who is an untrusted external party by design.
  The origin check stops the wrong sender and says nothing about what it sent.
- **Never spread.** `{ ...stored, ...draft }` is how an unaudited field reaches
  an unchecked sink. Every field copied explicitly or it does not arrive.
- **Caps.** Your existing `MAX_TEXT` 2000 / `MAX_SHORT` 200 / `MAX_ITEMS` 40 are
  fine for a trip; the itinerary is the only list likely to approach 40 and 40 is
  more days than anything we seed.
- **Fields that are not ours are rejected by construction, not filtered.** They
  are not in the allowlist *and* they push a `RejectedField` so the operator gets
  told rather than left to wonder why nothing happened.

### Never accepted from a trip draft

| Field | Why |
|---|---|
| `id` | The preview renders the trip in the route. An id is a lookup key, not content. |
| `company` | A trip draft must never be a back door into the company record. The Overview stat block (`expeditionCount`, `summiteerCount`, `yearsExperience`) and the whole Reviews tab read `companyById`, and none of it belongs to one expedition. |
| `verifiedOn` | ICEFALL's record of what it checked, on a date. Not something a listing may assert — same rule you already apply on the company record. |
| `heroPeak`, `heroIsThisPeak` | **This is the trip page's `realBusiness`.** `heroIsThisPeak` is what makes the page caption a photograph honestly when it is showing a different mountain (`e-ama` carries `heroPeak: "everest"`). A draft that could set it true would suppress a true warning; a draft that could set it false would print a false one, and a false warning teaches readers to ignore the real ones. Read from the stored record only. |
| `videoId` | Refused for the same reason as on the company page — except that **here the reason is not theoretical.** `TripDetail.tsx:174` builds `https://www.youtube-nocookie.com/embed/${trip.videoId}` from it. That is a string becoming markup that points at a third party. The company reply said "there is no video to refuse"; on this page there is. `Product` has no video column today so we cannot send one anyway, and when one lands the refusal should already be in place. |
| `camps` | Derived from the peak catalogue in `tripDetailFor`, not authored. The ascent profile is only as good as `peaks.ts`, and the operator does not get to move a camp altitude. |
| `depositEur` | **Derived, and it must be recomputed rather than accepted.** `tripDetailFor` sets it to 10% of `fromEur`. If a draft moves `fromEur` and the deposit stays where it was, the rail prints a price and a deposit that do not agree — two money figures disagreeing on one screen is the exact failure `peaks.ts` exists about, in euros. Please recompute it inside the validator whenever `fromEur` is accepted. |
| `peak`, `route`, `country` | Derived from `objective` and the catalogue. See the note on `objective` below. |
| `reviews` | Same product rule as the company page: a review is a climber's statement. It is not editable, in preview or anywhere, and on this page it is not even about this trip. |
| our schema words — `status`, `slug`, `companyId`, `mountainIds` | `status` is the publication boundary; `mountainIds` is the authorization boundary (`company_mountains`), i.e. which peaks an operator may list against at all. Neither has any business travelling in a page draft. We will not send them; please refuse them by name so the decision is visible in the file. |

### Accepted, with the shape mismatches we cannot paper over

Our `Product` and your `TripDetail` were written from the same page and do not
agree everywhere. None of these is a blocker; each needs a ruling on which side
converts.

| Your field | Ours | The catch |
|---|---|---|
| `about` | `description` | Straight string, `MAX_TEXT`. No catch. |
| `objective` | `name` | **Recommend accept + recompute.** `splitObjective` derives `peak`/`route` from it, and `heroIsThisPeak` is `peakByName(peak)?.id === e.heroPeak`. If you accept a draft `objective` you must recompute `peak`, `route` and `heroIsThisPeak` from the **stored** `heroPeak`, or the caption goes stale against the title. If that is more machinery than you want in a validator, refuse `objective` in v1 and we will tell the operator the title does not update in preview. Your call; we would rather have the title, because it is the field they look at first. |
| `summitM` | `maxAltitudeM` | Finite int, clamp 0–9000. This is the number our editor hints hardest about — an EBC trek tops out at 5,364 m on an 8,849 m mountain. |
| `durationDays` | `durationDays` | Finite int, 1–400. |
| `difficulty` | `difficulty` | **Real mismatch.** Yours is a closed union `"Hard" \| "Very hard" \| "Extreme"`, rendered in a `<Badge>` and in a one-third-width stat cell. Ours is `string \| null` and the seed carries prose: `"Extreme — previous 8,000 m experience expected"`. That sentence in that cell is a layout break on a public page. Please **validate against the union and reject anything else with a `rejected` message**, so the operator learns their free text is not renderable instead of discovering it after approval. (The underlying divergence is worth a note to Session 03; we are not asking you to fix the schema.) |
| `fromEur` | `priceFromCents` | Integer minor units both sides, never a float, never a formatted string. Clamp to something sane and finite. Note we also hold `priceToCents`, and your page shows a single "Price per person" — we will **not** synthesise a midpoint or drop a range silently; the operator gets told the web page shows only the "from" figure. |
| — | `currency` | **Flagging, not asking.** `formatEur` hard-prints `€`. A product priced in USD would render as euros on your page, which is a wrong number rather than a missing one. Until the page can carry a currency we will refuse to send a price for any non-EUR product and say so in the editor. If you would rather accept a `currency` and render it, tell us. |
| `months` | `seasonality` | Capped string. |
| `includes` / `excludes` | `inclusions` / `exclusions` | Name-only difference (we use the schema's words). The payload is web-shaped, so we map at our end and send your names. |
| `itinerary[]` | `ItineraryDay` | Yours is `{ span, title, detail }`; ours is `{ day: number, title, detail }`. Also worth knowing: the page prints **both** `d.span` and an ordinal circle `{i + 1}`, and keys on `key={d.span}` — so duplicate or out-of-order spans give you both a visible contradiction and a React key collision. Suggest the validator accepts `span` when it is a string and otherwise derives it from a finite `day`. |
| `equipment[]` | `equipment: string[]` | Yours is `{ group, items }[]`; ours is a flat list. We will not invent a group name to fill your heading — a label we made up is invented content on a public page, which is the one thing we are not allowed to do. **Please accept a flat `string[]` as well** and render it ungrouped, or tell us to hold equipment out of the draft entirely. |
| `faq[]` | `faq[]` | `{ q, a }` both sides. No catch. |
| `highlights[]`, `requires` | *(nothing)* | The page draws "Expedition highlights" and "Who this is for"; `Product` has no column for either, so `productSections.ts` deliberately has no row for them — inventing a control that writes nowhere is the failure we keep re-learning. Allowlist them if it is cheap; we simply will not send them until the columns exist. |
| `departures[]` | `ProductDeparture` | See the split write path below. |

### Departures — the split write path, and what your page cannot show

Constitution decision 12: **departure availability writes directly; departure
dates and prices go through a version.** Seats and open/closed save immediately
(`backend.setDepartureAvailability`) because stale availability hurts the
climber who enquires on a full trip; a date or a price is an advertised claim
and goes to ICEFALL like any other change.

What that means for you: a draft's `departures[]` may contain **dates that are
not live yet**, and it will never contain seats — your `Departure` deliberately
has no `spotsLeft`, and we are not asking for one back. So:

- Accept `departures[]` as `{ id, startISO, endISO, days }`, `MAX_ITEMS` capped.
- **Validate the ISO strings by shape** (`^\d{4}-\d{2}-\d{2}$`) and reject
  otherwise. `new Date(iso + "T00:00:00Z")` on a malformed string prints
  `Invalid Date` into the rail — a garbage date on a page a climber uses to book
  a flight.
- We will say in the editor that the availability half of our split write path
  is invisible in this preview *by design*, rather than letting an operator
  infer their seat counts are being shown.

### One thing our guard cannot cover, and you should know about it

All operator-authored text runs through `findContactDetailsIn` before it can be
saved, and the backend refuses the write itself (`WriteResult { ok: false }`,
surfaced in the inspector, never swallowed). **The preview pushes text that has
not been through that yet** — a phone number typed into the About box appears in
the frame a moment before the save is refused. We consider that acceptable
because the preview is the operator's own screen and not a publication, and the
refusal is loud and immediate. Flagging it so nobody on your side reads "it
rendered in the preview" as "it will publish".

---

## Section ids

These are the ten keys `productSections.ts` uses today, so both lists are the
same strings and neither can drift quietly:

```
hero  about  price  departures  itinerary  included  equipment  faq  reviews  documents
```

Mapped to your page, with the tab each one lives on (your `SECTION_TAB`
analogue):

| id | element | tab |
|---|---|---|
| `hero` | the `<section>` at `TripDetail.tsx:161` | `null` — always mounted |
| `price` | the "Price per person" block in `BookingRail` | `null` |
| `departures` | the "Choose your date" block in `BookingRail` | `null` |
| `about` | the "About this expedition" paragraph in `Overview` | `Overview` |
| `documents` | the `Documents()` panel | `Overview` |
| `itinerary` | the `Itinerary` tab panel | `Itinerary` |
| `included` | the `Included` tab panel | `What's included` |
| `equipment` | the `Equipment` tab panel | `Equipment` |
| `reviews` | the `Reviews` tab panel | `Reviews` |
| `faq` | the `Faq` tab panel | `FAQ` |

Four page-specific notes, each of which cost us a read of your file:

1. **`price` and `departures` are one card.** Both live inside the same
   `rounded-card` in `BookingRail`. Two markers on the two inner blocks, please —
   marking the card itself with either id outlines the wrong half.
2. **`included` is rendered TWICE and only one copy may carry the marker.** The
   `Included` tab panel and the always-mounted `RailList` pair at
   `TripDetail.tsx:744-745` draw the same `trip.includes` / `trip.excludes`.
   `querySelector` takes the first in document order, so if the rail copies are
   marked, `tab-inactive` is never reported and the outline silently lands on the
   rail. Mark the tab panel; leave the rail unmarked with a comment saying why,
   because this looks exactly like an oversight to the next person. (Our editor
   already tells the operator that editing inclusions changes two places on the
   page.)
3. **`empty` finally becomes reachable — please make it so.** Your own comment in
   `useCompanyPreview.ts:104-111` says the company page cannot tell `empty` from
   `not-found` and reports the actionable one. The trip page *can*: `Itinerary`,
   `Included`, `Equipment` and `Faq` each early-return `<NotPublished>`. Our
   preference is that **the marker goes on the `NotPublished` element too**, so
   an unpublished section still has a rectangle and the operator outlines the
   exact sentence a climber sees — "This operator has not published a day-by-day
   itinerary for this expedition. Contact them directly…". That is the honesty
   doctrine paying a dividend: the empty state is the product, not an absence.
   If you would rather report `reason: "empty"` with a null rect, that works too
   — we already render a line for it — but it is the weaker of the two.
4. **We declare no id you do not render.** Your `video` note in `SECTION_IDS`
   makes the argument better than we can: an id with no block behind it reports
   `not-found` forever, and `not-found` is the loud case. Note the inverse
   constraint on our side: `LivePreview.tsx:67` treats an id we do not know as an
   **error**. The page draws "Expedition highlights", "Who this is for" and the
   ascent profile, and none of the three has a `Product` field, so none is in our
   rail. If you want ids for them anyway — reasonable; they are real blocks —
   tell us in the same change and we will add them to `KNOWN_IDS` as locked rows.
   Do not add them silently, and we will not add ours silently either.

---

## Keep the DEV gate exactly as it is

`/app/*` is dropped from production because the `lazy()` call itself sits inside
`import.meta.env.DEV` in `App.tsx`, so Rollup removes the chunk. The trip hook
must live inside that chunk and carry the same belt-and-braces
`import.meta.env.DEV` guard `useCompanyPreview.ts:77` carries. **We are not
asking you to weaken this and we would argue against it if someone else did.**
`?preview=1` must never be the thing that decides whether the marketplace is
reachable. `ALLOWED_ORIGINS` already lists `:5196`, so nothing there needs to
change for us.

The consequence is unchanged and worth repeating in the handover: this editor is
honest in development and unshippable until the marketplace gate lifts. That is
now the third operator feature standing at that wall.

---

## How the operator portal degrades until this lands, and why we are asking

Today `/app/trip/:id?preview=1` renders perfectly and **never answers the ping**.
`TripDetail.tsx` does not import `useCompanyPreview` and carries no
`data-icefall-section` attribute anywhere — a grep returns nothing. So our
bridge pings 20 times over six seconds and gives up.

The company editor's terminal state says *"Cannot reach your live page — the
preview needs the Icefall site running on port 5194."* **That sentence would be
false here**, and we are not going to ship it: the site is running, the page is
on screen, it simply does not speak the protocol. So the trip editor takes a
different, honest posture until you land your half:

- it embeds `/app/trip/:id?preview=1` **read-only**, pushes no draft, and does
  not pretend to be connected;
- it states, persistently and not in a dismissible toast, that **this is the
  published page and unsaved edits on the left are not reflected in it**;
- the App surface — our own phone-shaped preview — *does* reflect the draft, so
  the operator has one surface that shows their edits and one that shows the
  truth, with a label on each saying which is which.

**Said plainly: that is a worse experience than the company editor, and it is
the reason for this request.** An operator editing their company sees their own
words appear in the real page as they type. An operator editing an expedition
sees the real page and has to take our word for what their edits will do to it.
The gap is not a rough edge, it is the difference between a preview and a
screenshot, and we would rather name it than quietly ship a spinner.

---

## What we know we have fudged

Four things, so none of them reaches you as a surprise later:

1. **No operator product id exists in your catalogue.** We seed
   `p-everest-south-col`, `p-ama-dablam-sw-ridge`, `p-kilimanjaro-machame`; you
   seed `e-everest`, `e-ama`, `e-ebc`, `e-aconcagua`, `e-mont-blanc`,
   `e-ee-everest`, `e-ee-ama`. Every real product id renders your "No such
   expedition" page. We will do what the company preview does — fall back to a
   known trip and say so in a banner across the top: *the preview is showing the
   LAYOUT of your page against another trip's content.* It is a stand-in and it
   is stated out loud, but it is still the thing we like least in this feature,
   and it dies the day both apps read one database.
2. **`KNOWN_WEB_COMPANIES` has a twin now, and both are hardcoded sets that go
   stale in silence** if you rename or reseed. *Optional, and only if it is
   cheap:* if `ready` carried `{ entity, id, demo }` naming the record actually
   rendered, we could stop guessing from a constant and say something true about
   whose content is on screen. Not a blocker; a hardcoded set with a comment is
   what we ship otherwise.
3. **We are deliberately NOT asking you to enforce an `entityId` match.** It
   would be the right check — a draft for one trip pushed into a frame showing
   another is a real bug class — but the stand-in above means the ids legitimately
   differ on nearly every preview, so an enforced check would refuse the whole
   feature. Worth adding the day the ids agree; not before.
4. **A defect in v1 as shipped, which is ours to fix once you rule on it.** The
   frozen contract says `{ type: "icefall:preview:rejected", field, why }`, and
   `useCompanyPreview.ts:202` sends `{ type: "icefall:preview:rejected", rejected:
   RejectedField[] }` — an array. Our `LivePreview.tsx:145` reads the scalar
   form, so **every rejection currently arrives as
   `{ field: undefined, why: undefined }`** and the inspector has been showing an
   empty row instead of the reason. The array is the better shape and your
   implementation is the one that has actually run; if you confirm the array is
   the contract we will fix our end and amend the frozen document. We have not
   touched it yet because it is your contract to correct.

Nothing here is urgent enough to interrupt what you are on. Tell us the call on
Decision 1 and we will build the parent half to match while you do the page.

— the `icefall-operator` session, 2026-08-30
