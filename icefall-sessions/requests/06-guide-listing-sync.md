# Request — a guide's listing has nowhere to live but their browser

**From:** Session 05 (`icefall-guide`) · **Date:** 2026-08-30
**Owner of the asset:** the brain (schema)

Written at the brain's request rather than built. Ordered by what it costs the
product, not by size.

---

## The state today, plainly

A guide can now sign in. Everything they *build* still dies with their browser.

| What they set | Where it lives now | Survives a new phone? |
|---|---|---|
| Mountains and treks they guide | `localStorage` (`icefall-guide:listing:v2`) | **no** |
| Per-route day rate, grade, typical days | same key | **no** |
| Per-route prerequisites | same key | **no** |
| Which days they are free | `localStorage` (`icefall-guide:availability:v1`) | **no** |
| Name, title, bio, languages, based-in, header peak | same listing key | **no** |

**Clearing site data is enough to lose all of it**, and there is no server copy
to restore from. A guide who sets up their listing on a phone, then opens the app
on a laptop, sees an empty app and has no way to know why.

That is worse than it sounds for one specific reason: **the prerequisites go with
it.** "What the client must already be able to do" is the field that stops
somebody booking a route they cannot climb. It is currently the least durable
thing in the product.

---

## 1. HIGH — per-route terms have nowhere to go

`guide_profiles` carries `mountains text[]`, `daily_rate_eur numeric` and `bio`.
That covers roughly a third of a listing and flattens the rest:

- **`mountains text[]` cannot hold terms.** A guide's rate for the Matterhorn is
  not their rate for a base-camp trek, and neither are the prerequisites. One
  array of ids and one `daily_rate_eur` for the whole person cannot express that.
- **There is no trek half at all.** A guide who runs the Tour du Mont Blanc is
  selling something real; 252 treks exist in the catalogue and a guide can offer
  none of them in the schema.

**Shape requested** — one table, both kinds, following the precedent
`destinations` already set (owner decision 17: mountains and treks share one
placeable table with a `kind`, verified free of slug collisions):

```
guide_routes
  guide_profile_id  uuid    not null → guide_profiles(id) on delete cascade
  kind              text    not null check (kind in ('mountain','trek'))
  destination_id    text    not null → destinations(id)
  routes            text    not null   -- "Hörnli ridge". The guide's own words
  grade             text    not null check (grade in ('introductory','moderate','technical','expedition'))
  day_rate_cents    bigint  not null check (day_rate_cents > 0)
  typical_days      int     not null check (typical_days between 1 and 120)
  requires          text    not null check (length(btrim(requires)) >= 10)
  primary key (guide_profile_id, kind, destination_id)
```

**Two constraints that are safety rather than tidiness, and I would argue for
both:**

- **`requires` NOT NULL and non-trivial.** A guide advertising the Hörnli with
  that field blank is how somebody books a route they cannot climb and finds out
  at 3,000 m. The app already refuses to save without it; the database should
  refuse too, because the app is not the only thing that will ever write here.
- **`day_rate_cents` in integer minor units, never `numeric`.** `guide_profiles.daily_rate_eur`
  is `numeric(10,2)`, which contradicts the family's own rule that money is
  integer minor units and never floats. Worth correcting while nothing depends
  on it.

**SETTLED 2026-08-30 — A GUIDE MAY OFFER THE SAME PEAK TWICE, so the key above
is wrong and this is the corrected shape.** I had assumed once-per-peak and asked;
the brain ruled the other way and the reasoning is decisive: *a Matterhorn day
rate and a Matterhorn four-day traverse are different products*, and a primary key
that forbids it is one nobody can migrate past cheaply once data exists.

So `guide_routes` takes its own id, and `(guide_profile_id, kind, destination_id)`
becomes an INDEX rather than the key:

```
  id                uuid    primary key default gen_random_uuid()
  guide_profile_id  uuid    not null → guide_profiles(id) on delete cascade
  kind              text    not null check (kind in ('mountain','trek'))
  destination_id    text    not null → destinations(id)
  ... terms as above ...
  index on (guide_profile_id, kind, destination_id)
```

Recorded here rather than left as an open question, because a stale question on
disk gets answered again by somebody with no memory of this exchange (§6i).

---

## 2. HIGH — dated availability has nowhere to go

`guide_profiles.availability` is one enum for the whole person —
`available | limited | unavailable`. It cannot say "I am free in September".
`product_departures` is the right shape and belongs to a company.

```
guide_availability
  guide_profile_id  uuid  not null → guide_profiles(id) on delete cascade
  day               date  not null
  state             text  not null check (state in ('available','unavailable'))
  note              text
  primary key (guide_profile_id, day)
```

**A ROW MEANS THE GUIDE SPOKE. Absence must not mean "unavailable."**
"I have not said" and "I am busy" are different statements, and only one is a
refusal of work — the athlete app's `setDayAvailability` deletes the key rather
than storing a default for exactly this reason. So clearing a day is a DELETE,
and `state` deliberately has no `not_set` value: not-set is the absence of a row.

**`booked` is deliberately not a state here.** Booked days are derived from
`bookings`, so the calendar can never disagree with the trips — and a guide must
not be able to mark themselves free on a day a client has paid for. The app
already enforces this; keeping it out of the enum keeps it true at the database.

---

## 3. MEDIUM — the profile fields that exist are close but not complete

`guide_profiles` has `headline`, `based_in`, `languages`, `years_guiding`, `bio`.
Missing for what the app now edits: a **title** (the qualification they work
under — "IFMGA Mountain Guide"), a **nationality**, and a **header image**
reference. The last one is a `destinations(id)` today rather than an upload,
because there is no media store this app can write to and no licensed portrait
set — see the note below.

---

## 4. LOW — no photographs, and that is currently a feature

The app draws generated portraits for people and uses the credited peak library
for places. It uploads nothing, because `media_assets` requires a photograph
licence and credit before approval, and a guide's own photograph has neither.

**Not asking for uploads yet.** Flagging it because "Airbnb for guides" implies
them, and the moment they exist the question is consent and licence for a real
person's face — which is a product decision before it is a schema one.

---

## What I have NOT done

- Not written a migration.
- Not built sync. The stores are behind `data/listingStore.ts` and
  `data/availabilityStore.ts` with a `loadListing(seed)` / `saveRoutes(...)`
  shape, so swapping local storage for queries is contained to those two files
  and no screen changes.
- Not touched `guide_profiles`.

## Related, filed separately in FINDINGS.md and more urgent than any of this

**`guide_profiles_write` currently lets any signed-in user insert their own
`guide_profiles` row and set `listed = true`.** That is what decides `guide` in
`open_support_ticket`, and it is what my sign-in gate reads. Whatever shape the
tables above take, they hang off a membership anybody can grant themselves today.
