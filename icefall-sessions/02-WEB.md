# Session 02 — ICEFALL Web

> **Read `icefall-sessions/00-CONSTITUTION.md` first.** It holds the honesty
> doctrine, the standing rules, the anti-drift protocol and the owner's
> decisions. This brief only covers what is specific to your scope.

## Your scope

**`icefall-web/` and nothing else.** Dev server: launch config **`icefall-web`**,
port **5194** (runs `dev:all`, which also starts the zero-dependency Node API
server on **8788**). Handbook **Chapter 17** is your chapter.

You also own, on behalf of every other session:
- **The trek catalogue.** `src/data/trek-source/*.json` → compiled to
  `trekRecords.ts` + `trekPhotoCredits.ts`, then copied into the phone app.
  Regenerate here; the phone app's copy is generated and must never be hand-edited.

## The single most important thing to understand

**The public site is the waitlist, and only the waitlist.** The entire product
is DEV-gated:

```tsx
const AppShell = import.meta.env.DEV ? lazy(() => import("@/app/Routes")) : null;
```

The `import.meta.env.DEV` test wraps the **`lazy()` call**, not just the
`<Route>`. Vite substitutes `false`, the ternary folds to `null`, the dynamic
`import()` becomes unreachable, and Rollup drops the chunk. Guarding only the
route left a 74 kB chunk shipped-but-never-fetched in `dist/`.
**Do not "simplify" this.**

Why it is gated that hard: behind that link are invented mountain guides carrying
invented IFMGA licences and day rates, and real companies carrying ICEFALL's
placeholder figures. A deployed URL is readable by anyone with the link.

**Consequence:** nothing you build under `src/app/` is on the deployed site. It
runs at `localhost:5194/app/…` and nowhere else. Budget for that before any demo.

## What is in it

There are **two** DEV-only route trees, not one:
- `/app/*` — the current product (`src/app/Routes.tsx`)
- `/preview/*` — the older search-first marketplace (`Marketplace.tsx`, 9 routes)

```
/app                  Home              /app/treks            Trek index (filters in the query string)
/app/find             Trail search      /app/trek/:id         Trek detail
/app/mountains        52 peaks          /app/guides           Find-a-guide, three-step
/app/mountains/:id    Mountain page     /app/guides/:id       Guide profile
/app/expeditions      Marketplace       /app/company/:id      Operator profile
/app/social           Feed              /app/trip/:id         One expedition listing
/app/social/leaderboard | /people | /groups
/app/coach /profile /saved /bookings /messages /notifications /settings
/app/explore          REDIRECT — keeps old ?tab= links alive
```

**The catalogues are the asset.** `src/data/peaks.ts` (52 peaks) is the single
source of truth for summit altitudes — it exists because they once lived in two
places and disagreed (Ama Dablam 6,812 vs 6,814, Everest 8,848 vs 8,849). A
number a user can see in two places must come from one place. Companions:
`peakFacts.ts` (52 keys, coords + descriptions 52/52, prominence 50/52, first
ascent 48/52), `peakGallery.ts` (303 photos), `peakPhotoCredits.ts` (52 heroes).

Treks: **252 routes across 22 of 22 regions, 238 photographs.** Trek is its own
entity with its own difficulty scale (Easy / Moderate / Strenuous / Very
strenuous) so summit vocabulary never leaks onto a walk.

## Your work, in priority order

### 1. Re-run the investor bug sweep — the oldest open item
This is §17.9 item 3, the only one of the original three still open, and **it has
died to Mac sleep twice**. Run `caffeinate -dimsu -t 5400` first.

Only `unlabelled-invented` ever reported. **Never actually reviewed:**
routes-render, dead-links, images, data-contradictions, layout-responsive.

Still-open findings from the one reviewer that finished:
- Home's **"26% planned"** progress bars — invented, page-level notice only
- **"Coach credits · 8 available"** — a metered balance nothing in the web
  codebase defines; the term appears in exactly one place
- **The unread-message count says three different things in three places**
- Coach's Conditions card presents invented weather as a live reading
- **"24/7 Support" hardcoded for every operator** (`app/TripDetail.tsx:335`,
  `app/Company.tsx:357`) — in a stat row where every neighbouring tile correctly
  falls back to "Not published"
- **ICEFALL's own refund policy printed as the operator's terms** — on a real
  company that is a commercial statement we have no authority to make

### 2. Replace real company names with fictional ones (owner decision #2)
Elite Exped, Seven Summit Treks, Adventure Consultants, 14 Peaks Expedition.
Gated at their definitions (`data/demo.ts:15`, `IS_DEMO = import.meta.env.DEV`),
but the exposure is a real business on a €62,000 page with a booking button, and
every new surface has to remember the guard forever. Both failures so far were
pages that forgot.

### 3. Trek catalogue gaps
- **All 252 treks have `operatorIds: []` and `guideIds: []`.** Correct today —
  no operator has listed with us — but it is the gap between a catalogue and a
  marketplace, and "Enquire" is standing in for a booking. The relation is
  already derived (`operatorsForTrek`, `treksForOperator`); it needs *data*, not
  code. **This is the seam where Session 04's operator portal plugs in** — file
  a request when you know the shape you need.
- **14 treks have no photograph**, listed by absence from `TREK_PHOTO_CREDITS`:
  `dales-way`, `giants-cup-trail`, `rhino-peak-hike`, `dagala-thousand-lakes-trek`,
  `nar-phu-annapurna-circuit`, `bumthang-owl-trek`, `via-alpina`,
  `cotahuasi-canyon-trek`, `mnweni-circuit`,
  `injisuthi-to-cathedral-peak-traverse`, `heights-of-alay-trek`,
  `keskenkija-loop`, `seven-lakes-trek`, `ancascocha-trek`.
  **Do not lower the bar to close this.** Three were removed *after* a photograph
  was found, because it was of a plaque, an aerial or a festival rather than the
  walk.

### 4. Housekeeping
- **662 untracked files** in your tree, including all of `src/data/` (peaks,
  facts, gallery, credits) and 30 files under `src/app/`. `git ls-files
  icefall-web` returns only 56. The catalogues that are "the asset" are not in
  git. Raise this with the owner before doing anything about it.
- Trek records have **drifted** from the phone app's copy (147348 vs 147352
  bytes) and there is no sync script. Building one — the way `icefall-shared`
  syncs `money.ts` — is a fair request.
- Fuji's five gallery entries use a second path convention
  (`/img/gallery/fuji/<n>.jpg`) that nothing else uses.

## Hard invariants for your tree
- **Photo pipeline: a name is not a subject.** West Highland Way returned a
  terrier, Snowman Trek a snowman, Huemul Circuit a deer, Mount Meru a Buddhist
  mandala. The fix was `trekwiki.mjs` (Wikipedia lead image, 84 of 238) plus a
  two-word filename rule and a global no-reuse set — and the survivors were
  caught only by building a contact sheet and *looking at all of them*.
- `maxAltitudeM` is the high point **of the route**, never a nearby summit.
  Everest Base Camp Trek = 5,545 m (Kala Patthar), not 8,849 m.
- `priceFromEur` is **always null**. No operator has quoted us; the card says
  "Price on enquiry". 252 invented prices is what a marketplace must not do.
- Unknown = `null` → the UI prints "Not specified". Never a plausible guess.
- **A redirect is a render, not a guard — it goes below every hook.** Putting
  one above the `useState` calls in `Explore.tsx` killed the screen with
  "Rendered fewer hooks than expected". `TrailDetail.tsx` in the phone app
  carries the same warning.
- All invented data is gated **at its definition** (`IS_DEMO ? [...] : []`), not
  merely hidden at render.

## Verify
```bash
cd icefall-web && npx tsc --noEmit
```
**Do not judge a page by `curl`** — it is an SPA and returns 200 for everything,
including routes that render blank. A headless health-checker pattern
(`health.mjs`) loads a URL list and reports rendered character count, image
count, broken images, console errors and horizontal overflow — rebuild it if you
need it. Last full run: 16 static + 24 dynamic routes, zero broken images, zero
console errors.
