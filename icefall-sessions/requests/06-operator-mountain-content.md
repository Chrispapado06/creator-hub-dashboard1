# Request 06 → Session 03 (schema owner): per-mountain operator content — a pitch, and a home for the film

**From:** Session 04 (`icefall-operator/`)
**Date:** 2026-08-30
**Blocks:** nothing shipped. The mountain workspace works today against what
exists. This is about the one thing an operator cannot do at all.

The owner asked me for a **mountain page editor** — the third editor, after the
company profile (`src/screens/CompanyEditor.tsx`) and the trip
(`src/screens/ProductEditor.tsx`). I went to build it and found there is nothing
to edit. That finding is §3 below and it stands whatever you decide about §1 and
§2; I would want to know it even if you grant neither.

Two asks, one finding. Both asks are decisions that are yours to make. I have
stated a preference and a reason for each and I will build to whatever you rule.

---

## 1. A per-mountain pitch

### What I am not asking for

`CompanyMountain` in `icefall-operator/src/domain/types.ts:193` is deliberately
empty of content, and its comment says why:

> THE AUTHORIZATION BOUNDARY (spec §16), and nothing else.
>
> No position, no price, no term. Those live on `Placement`. Keeping them apart
> is what lets spec §18's two edge cases behave independently: a placement can
> expire while the operator keeps editing their trips, and access can be
> withdrawn while the placement record stays intact for the audit trail.
>
> In the database `authenticated` gets SELECT here and no write of any kind.

**I am not asking you to weaken that.** Whatever shape you choose, the
authorization decision and the operator's write path stay separate objects with
separate grants. If putting a writable column on that row is what would blur
them, then it should not go there — see the recommendation below, which is why I
lean the way I do.

### Why it is worth having

Concretely: an operator working **Everest and Kilimanjaro** has exactly one
`Company.description` doing both jobs. Their Everest pitch and their
Kilimanjaro pitch are not the same pitch, and today the schema forces them to
write one paragraph that is honest about neither.

On the reader's side it is worse. `icefall-web/src/app/MountainDetail.tsx:585`,
`TripRow`, is the whole of an operator's presence on a peak. It draws the
company mark or monogram, the company name, `t.objective`, the rating and review
count, `formatEur(t.fromEur)`, `t.durationDays` and `t.months`. Every one of
those comes off the company record or the product record. A climber choosing
between five outfits on Everest sees five trip objectives and no answer to *why
this operator on this mountain* — which is the only question they are actually
asking.

### The shape, and my recommendation

**My recommendation: its own table, `company_mountain_content`, keyed
`(company_id, mountain_id)`.** Three reasons, and the first is really the
answer to the "am I weakening the boundary" question above:

1. **`company_mountains` keeps its no-write grant intact.** The moment there is
   a proposable column on that row, someone maintaining `editable_fields` has to
   reason about which columns on that table an operator may touch, on the one
   table whose current answer is a flat "none". A separate table means the
   authorization row's answer stays "none, ever" and the test that asserts it
   never has to be softened.
2. **Different lifecycles, same argument you made for `placements`.** Access can
   end while the prose stays for the audit trail, exactly as an expired
   placement keeps its row.
3. It gives §2's film somewhere coherent to sit alongside the prose rather than
   as four more columns on the boundary row.

The honest counter-argument, which you may weigh higher than I do: a column on
`company_mountains` is one fewer table and one fewer join, the row already
exists for every (company, mountain) pair, and decision 15 already put the film
columns there — so a separate table means moving those. **That is a real cost
and it may outweigh my reason 1. Your call; I will follow it.**

Fields I need either way:

```
pitch          text null      -- the operator's paragraph for THIS peak
```

Optionally a short `headline` if you think the mountain page wants one, but I
have not designed a surface for it and would rather not ask for a field with no
consumer — see §2's note on decision 14.

### Three properties it must have

**a. It goes through `content_versions`, like every other published claim.**
It is operator-authored text a climber reads, so it is not directly writable.
That needs an `entity_type` value.

Note that my own original spec already had one:
`icefall-sessions/requests/01-operator-schema.md:121` lists
`content_entity_type : 'company' | 'product' | 'company_mountain' |
'media_asset'`. The shipped enum is three values
(`ContentEntityType`, `types.ts:47`) and dropping the fourth was correct at the
time — there was nothing per-mountain to version. If you grant this, that value
comes back. **I would name it `company_mountain` if the content lives on that
row, or `company_mountain_content` if it lives in its own table — the convention
so far is that the entity type names the table it patches.** Your naming, not
mine; I read the value off the wire and branch on it.

One thing to check on your side rather than mine: `content_versions.entity_id`.
If the content table's PK is a uuid this is unremarkable. If you key it by
`(company_id, mountain_id)` with no surrogate, `entity_id` needs to address a
composite — and mountain ids are `text` slugs, not uuids, per your own note that
**every `mountain_id` in the schema is `text`**. A surrogate uuid PK on the
content row is the boring fix and probably the right one.

**b. It must run the contact-details guard.** `findContactDetailsIn`
(`icefall-operator/src/domain/authz.ts:293`) checks a whole record's free-text
fields in one pass and returns per-field findings; it is built on
`findContactDetails` (`authz.ts:275`), which is what `CompanyEditor` and
`ProductEditor` already call on every free-text field before enabling submit.
I will wire the pitch into the same pass on the client. On your side it wants
the same advisory validator that sets `CONTACT_FLAG`
(`possible_contact_details`, `authz.ts:305`) on the version, so the Approval
Center sees it too — client-side alone is not enforcement.

**c. It needs a length cap, and it should be yours.** I would put it at **600
characters** and render a counter. Reasoning: this renders inside or under
`TripRow`, which is a compact row in a list of five; a pitch that runs longer
than a short paragraph either gets clamped by the web session (in which case the
operator is writing into a void) or it distorts the row. 600 is roughly four
sentences. I have no cap on `Company.description` to copy from — there is
genuinely no precedent in the client — so I am proposing rather than matching.
**Set it as a CHECK constraint and tell me the number; a cap the client enforces
and the database does not is a cap.**

---

## 2. The promotional film, which is currently homeless

### Where it went

`Company.video` was removed. The comment recording that is in `types.ts:145`:

> NO `video` FIELD, deliberately. Owner decision #15 (2026-08-29): the
> promotional film belongs to the mountain surface, not the company. The
> `PromoVideo` type survives below because products and mountains still use
> it — only the company lost the field.

**That last sentence is no longer true, and I should say so plainly rather than
let it sit.** I checked: `Product` has no video field either
(`types.ts:264–296`), and `PromoVideo` (`types.ts:353`) has **no consumer
anywhere in the operator app**. Its only references are inside
`src/editor/VideoField.tsx`, which is itself imported by nothing. Nothing in
`icefall-web` reads it either — `MountainDetail.tsx` has no video block at all,
and `Company.tsx:442` renders a click-gate whose text is *"No video has been
published by this operator."*

So the type, the control and the player all exist and nothing on either side of
the wire can reach them.

### What I am asking for

Constitution decision 15 already answers the *where*:
`video_source`, `video_youtube_id`, `video_media_id` and the coherence
constraint on **`company_mountains`**. I am not reopening that.

What I am asking is that the film ride along with whatever shape you choose for
§1 — **if** you put the pitch in a separate table, the film columns should move
there with it rather than the two halves of one mountain-page block living on
two tables. If you keep the pitch on `company_mountains`, nothing moves and this
ask is already satisfied; tell me and I will add the fields to `CompanyMountain`
in the client model.

The coherence constraint from request 03 carries over unchanged:

```sql
check (
  (video_source = 'none'    and video_youtube_id is null and video_media_id is null)
  or (video_source = 'youtube' and video_youtube_id is not null and video_media_id is null)
  or (video_source = 'upload'  and video_media_id  is not null and video_youtube_id is null)
)
```

### The operator-side player already exists, and it is deliberate

Do not let anyone rebuild this as a URL column. `PromoPlayer`
(`icefall-operator/src/editor/VideoField.tsx:54`) reproduces `icefall-web`'s
gate exactly: the iframe is mounted **only after a click**, from
**youtube-nocookie.com**, with the same params and referrer policy. Nothing
contacts Google for a reader who never presses play. `youtubeId` is stored as an
**id, never a URL** — `youtubeIdFrom` (`VideoField.tsx:33`) parses a watch URL,
a share link, an embed URL or a bare id down to the eleven characters, because
an operator will paste any of the four and all four are the same intent. A
column shaped like a URL is one step from `<iframe src={...}>` on page load.

### One dependency I am flagging, not asking you to solve

Constitution decision 14 is explicit that **the id and the implementation land
in the same change**, and that Session 04's film row had to be disabled until a
surface existed to render it. That rule applies here in exactly the same shape:
`icefall-web`'s mountain page has no video block today. **So the columns can
land whenever you like — but I will not ship an enabled film control on the
mountain editor until Session 02 builds the block that renders it.** That is my
constraint to respect, not yours to unblock; I mention it so nobody reads a
shipped column as a shipped feature.

---

## 3. A finding, not a request: the operator's mountain presence is 100% derived

Worth knowing whether or not you grant §1.

Every pixel of an operator's block on a mountain page is derived from records
they edit somewhere else. There is no per-mountain operator content anywhere in
the system. The practical consequence:

> **The only thing an operator controls about how they appear on a peak is
> which trips they publish there.**

Not the order (that is `Placement`, and `canEditPlacement()`
[`authz.ts:135`] returns `false` unconditionally for every operator, every role,
every mountain — with a test asserting the backend exposes no placement write of
any kind at all). Not the pitch. Not the film. Their name, mark, rating and
price all come from elsewhere. That is a defensible design and I am not
complaining about it — but an operator asking *"why do I look like that on
Everest, and how do I change it?"* currently has no answer anywhere in the
portal, and the honest answer is "publish a different trip".

**One thing I should flag against my own app while I am here.** The Mountain
info tab in `icefall-operator/src/screens/MountainDetail.tsx:144–173` renders
three rows — "Overview", "Route & season", "Permits & regulations" — each with
`<StatusChip status="live" />` and an "Edit mountain info" button. Those are
hardcoded from the mockup. **No such content exists in the model, so the chip is
asserting three things are live that were never written.** It is the same defect
decision 14 caught in the film row: a control that writes into nothing. I do not
own that file this session, so I am recording it here rather than silently
leaving it — it either gets backed by §1 or it gets honest.

---

## What I do if you say no

Nothing breaks. I build the mountain screen as **"how you appear on this
mountain, and where each part of it is actually set"** — a read of the derived
block with each element traced to the record that sets it and a link to the
editor that owns it, plus the placement facts as read-only. That is genuinely
useful on its own and it is what §3 says an operator has no way to learn today.
If §1 lands, the pitch and the film become the one editable section on that
screen and everything else stays a trace.

Either way I will build against the in-memory adapter first, as with request 04,
so nothing here assumes your answer.

— Session 04
