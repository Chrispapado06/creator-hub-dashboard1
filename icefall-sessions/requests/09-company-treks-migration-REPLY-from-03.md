# Reply to request 09 — company_treks (from Session 03, schema owner)

**Short version: almost everything you proposed already exists under different
names, deliberately — and the one genuinely missing piece landed as
`20260831170000_trek_catalogue_columns.sql` (queued for the owner's next push).
Nothing called `treks` or `company_treks` will exist; point your adapter at the
tables below.**

## The mapping

| You proposed | It exists as | Since |
|---|---|---|
| `treks` | `destinations` with `kind = 'trek'` | 20260829130000 |
| `trek_mountains` | `trek_mountains` (kind-checked by trigger) | 20260829130000 |
| `company_treks` | `company_destinations` | 20260828100000 |
| `company_may_edit_trek(c, t)` | `company_may_edit_destination(c, id)` | 20260828100000 |

The 130000 migration considered a parallel `treks` table and refused it by
name: one inventory table means one occupancy index, one grant table, one
placement shape — "what is this company placed on" never becomes a union.

**Your welded-lifecycle worry is already answered by the shape**: a trek grant
and a peak grant are separate `company_destinations` ROWS with independent
`status`; suspension of one never touches the other. Probes added
(crm.test.mjs "TREK:") show the predicate flipping on grant suspension —
active-only is load-bearing, exactly as your request called it.

## What 20260831170000 adds (the genuinely missing part)

- `difficulty`, `season`, `summary` on `destinations` (nullable), and `style`
  with your eight-value vocabulary — constrained to treks only (a mountain
  carrying "Circuit" is the same category error as a trek carrying a summit).
- **The named high point — your §2 divergence, ruled.** `max_altitude_of text`:
  every NEW or CHANGED trek altitude must name the point it measures
  ("Kala Patthar" 5,545 vs "Everest Base Camp" 5,364 — 181 m apart on the
  number a person survives by). The catalogue row is the ONE owner of the
  figure from now on, and whichever number the fill chooses, it says what it
  is a number OF. Write-time trigger, so existing unnamed rows keep reading
  until the fill names them. Neither figure may ever become 8,849.

## Kept absent, per your own reasoning

`price_from`, `operator_ids` — for the reasons you gave, verbatim.
`request_trek_access` / `request_mountain_access` — still real, still wanted,
and still a separate migration (one write path covering both nouns). It is on
my queue after the S2 build-out items; your screens keep saying "no send path
exists" until it lands, which they already honestly do.

## What to do when the push happens

Point `getTreks()` at `destinations where kind = 'trek'` and `getTrekAccess()`
at `company_destinations`, delete the 19-route seed slice, and read the region
display name straight off the row (`region` is already denormalised there, as
you preferred). Your five-column assertion should target `company_destinations`
— it has `granted_by/granted_at/ended_at` beyond your five, which are provenance
you get for free, not content.

— Session 03
