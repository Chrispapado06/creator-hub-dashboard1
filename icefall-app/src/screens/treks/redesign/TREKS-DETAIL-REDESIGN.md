# Treks page redesign — three directions for review

Owner's flight note (15 Sep 2026), quoted in full: *"Page redesign - 3
variations minimum create a prompt and add it in a pdf for all mockups to be
handed."* Plus: *"Remove all boxes dont make it look boxie + remove the
unessecary text and info about how line is matched or not."*

This is not a literal PDF — a markdown doc, kept beside the three draft
screens it describes, is what a design tool or another person can actually
open and act on. If a PDF is genuinely wanted for handing off, this file
converts to one in a minute; nothing here depends on the format.

**Which page.** The note is filed under "Treks" but its specific complaint —
"how line is matched or not" — is wording that exists on exactly one screen:
the individual trek page, `src/screens/treks/TrekDetail.tsx` (reached at
`/explore/trek/:id`). The Treks *list* page (`Treks.tsx`, the 252-route
catalogue with region/difficulty/length filters) carries no such text at all.
So this redesign targets the trek detail page. Judgement call, not a
guarantee — flagged again in the GAPS section of the build report.

**Where to look.** Three real, independent, working screens, each reading the
same live trek data the production page does, mounted at their own temporary
route so `/explore/trek/:id` is untouched:

- `/dev/treks-redesign-a/tour-du-mont-blanc` — Direction A, "Field notes"
- `/dev/treks-redesign-b/tour-du-mont-blanc` — Direction B, "One scroll"
- `/dev/treks-redesign-c/tour-du-mont-blanc` — Direction C, "Brief"

Swap the id for any of the 252 treks in the catalogue (see
`src/treks/records.ts`); Tour du Mont Blanc is the default because it is one
of the roughly one-in-three treks matched to a real OpenStreetMap line, so it
is the id that shows the map, the elevation profile, and the GPX/Start Route
controls working. A banner across the top of every draft says which
direction you're on and links to the other two and back to the live list.
DEV and DEMO builds only — these routes do not exist in production.

---

## The design prompt

The paragraph below is written to be handed to a person or a mockup tool on
its own, with no other context, and to produce any of the three directions
(or a fourth) consistently with ICEFALL's existing design language.

> Redesign the individual trek detail page of a mountaineering/trekking
> travel app (ICEFALL). Dark theme by default (near-black "obsidian"
> background, off-white "snow" and "mist" text, a single "azure" accent blue
> — no other saturated colour). **No bordered cards or boxes anywhere** —
> every section is separated by a 1px hairline rule and vertical whitespace
> only; the sole boxed element allowed is the map itself, because it is a
> drawing, not a container. Page must still open with a real photograph of
> the route (full-bleed hero, a smaller banner, or something in between —
> that is the direction's own call) with its photo credit and licence
> printed underneath, plus one line saying when the photo is of a *mountain
> the route visits* rather than the route itself (a licensing/honesty
> requirement, not decoration). Show: the trek's name, country/region/style,
> duration, difficulty grade, high point, season, a summary paragraph, a
> mapped-line section (map, elevation profile, GPX download, "start route")
> **that does NOT explain how or whether the line was matched to the trek —
> no toggle, no "evidence", no confidence grade, no OpenStreetMap-relation
> explainer paragraph; at most one short caption line of attribution**, a
> "what to prepare" checklist, a companies/operators section, and nearby
> routes in the same region. Keep every safety disclaimer (the line is
> volunteer-surveyed OSM data, may be wrong, carry a map and compass; defer
> to a certified guide on glaciated or high-altitude ground) — those are not
> "matched" text and stay in full. No prices, no star ratings, no invented
> numbers anywhere; an unpublished fact prints an em dash or "Not
> specified", never a guess.

Each direction below is that same prompt answered a different way — a
genuinely different structure, not a recolour of one layout.

---

## Direction A — "Field notes"

**The closest of the three to the page's current shape.** Full-bleed
photograph hero with the back and share buttons floating as glass discs over
it, exactly as the live page has since 8 Sep — that layout is already
owner-approved and the brief was to de-box and de-clutter it, not discard it.
Below the photo, a lapped content sheet carries the trek's name (set in the
app's one Instrument Serif italic accent — used nowhere else on the page, so
it reads as the one deliberate flourish), the country/region/style line, the
duration/difficulty/high-point figures, the summary, and the same five-tab
strip the live page has (Overview / The route / Preparation / Companies /
Nearby). Every `Card` is gone: each tab's content is hairline-divided flat
rows or a short paragraph under a serif-italic section label instead of a
bordered panel. The map section keeps its map, elevation chart, Start Route
and GPX buttons and the full safety disclaimer — what's gone is the "How
this line was matched" toggle and its evidence list; in its place is one
small caption line, "OpenStreetMap · relation {id}".

*Screenshot-worthy moment:* scroll past the photograph into the sheet and
watch the tab strip switch between five panes with no card ever appearing —
just type, hairlines and the one serif headline.

## Direction B — "One scroll"

**The direction that actually changes the page's structure, not just its
skin.** No tab strip at all: Overview, the route, preparation, companies and
nearby routes are one continuous page, the way a long-form article or an
AllTrails route page reads. A shorter hero gives way to the trek's name and
then a large, unclamped pull-quote of the summary — this direction leads
with the writing rather than hiding it behind "Show more". Under that, a row
of five rounded "jump chips" (Route / Prepare / Companies / Nearby) that
smooth-scroll to a section rather than switching a pane — nothing is ever
hidden behind a tab a reader might not tap. Same rule as A: no cards, only
hairlines between sections; the mapped-line section keeps the map, the
elevation profile, the buttons and the full safety disclaimer, and drops the
same matching-evidence text down to the same one-line caption.

*Screenshot-worthy moment:* the pull-quote summary directly under the hero,
big enough to read as the page's real opening line rather than metadata —
then the whole page scrolling past in one continuous pull, jump chips as the
only wayfinding.

## Direction C — "Brief"

**The most compact and the most different-looking of the three.** Ordinary
in-flow back/share buttons instead of glass discs over a full-bleed
photograph — this direction treats the photo as a small banner (about
130px), not the top of the screen. Immediately below it: a flat fact table
(country, region, style, duration, difficulty, high point, season) as
right-aligned rows, before a single word of prose. The summary itself is
collapsed behind "About this route ›" and opens only on tap. Every remaining
section — route, prepare, companies, nearby — follows the same terse,
numbers-first register: nearby routes are a plain list of name-and-duration
rows (all three directions use this list now — see the correction note
below), and even the map's captions are shortened ("OSM relation {id}"
instead of a sentence). Same map, elevation profile,
GPX/Start controls and full safety disclaimer as A and B; the matching
evidence is dropped the same way.

*Screenshot-worthy moment:* the fact table sitting directly under a
noticeably smaller photograph — a reader gets every number on the route
before they have scrolled past the banner.

---

## Correction (15 Sep 2026, same pass)

Directions A and B originally rendered the "Also in {region}" nearby-routes
list with `TrekCard` — the same photo-card component the live Treks list
uses, which wraps its content in the app's bordered `Card` primitive
(`border border-hairline bg-graphite`). That is a box, and Direction A's own
code comment claimed "every `Card` is gone" while contradicting it two
hundred lines later — caught on review, not by the owner. Both directions now
use the same flat, hairline-divided name-and-duration list Direction C
already had. No visual difference remains between the three directions'
nearby-routes sections; what still tells them apart is the hero, the summary
treatment, and the tab/scroll structure described above.

## What is deliberately unchanged across all three

- The Companies tab's operator listings (`OperatorCard`) — a component shared
  with the mountain and peak pages. Restyling it is a bigger change than a
  Treks-only redesign and was left alone; its own "matched to country and
  altitude, not booked or endorsed" sentence is a *different* claim (about
  operator matching, not line matching) and stays exactly as worded.
- Every safety disclaimer: the OSM-data warning, the "carry a map and
  compass" line, and the certified-guide deferral on glaciated or high
  routes. None of that is "how the line was matched" text — it is the app's
  standing safety position and this task's scope did not extend to it.
- The photo-subject line ("This is Mont Blanc, a mountain the route visits —
  not a photograph of the route") — a photo-licensing fact the live page's
  own comments call out as something that "must not be lost to a redesign."
