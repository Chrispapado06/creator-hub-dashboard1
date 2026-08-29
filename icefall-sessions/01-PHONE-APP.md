# Session 01 — ICEFALL Phone App

> **Read `icefall-sessions/00-CONSTITUTION.md` first.** It holds the honesty
> doctrine, the standing rules, the anti-drift protocol and the owner's
> decisions. This brief only covers what is specific to your scope.

## Your scope

**`icefall-app/` and nothing else.** Dev server: launch config **`icefall`**,
port **5190**. This is the athlete-facing phone PWA — the original and largest
piece of ICEFALL, ~188k lines across 2,476 files.

You also own, on behalf of every other session:
- **The design tokens.** `src/index.css` is the canonical ICEFALL palette. Other
  apps copy from you.

## What is in it

Five-slot navigation, constant on every screen: **Home · Explore · START
(centre) · Coach · Profile**. 102 routes and 84 `React.lazy` declarations in one
334-line `src/App.tsx` under a plain `BrowserRouter`.

| Area | What it is |
|---|---|
| `src/tracking/` (4,231 lines) | The activity engine. `ActivityRecorder` is a plain class that **imports nothing from React**, so it can later run in a Capacitor shell or replay a Garmin import. Real GPS, Web Bluetooth HR, a labelled simulator. `filters.ts` smooths altitude then applies 3 m hysteresis — naive summation invents hundreds of metres per hour. Crash-safe: an iOS suspend mid-climb loses nothing. |
| `src/coach/` (10,345 lines) | The largest subsystem. `load.ts`, `readiness.ts`, `recovery.ts`, `briefing.ts` (the ease-off decision), `mountainReadiness.ts` (deliberately hostile to "you are ready"), `sessions.ts` + `exercises.ts`, `memory.ts`, `reviews.ts`, `liveCues.ts`. Chat is **eight scripted regex rules**; the LLM path is built and dormant behind an unset `VITE_COACH_ENDPOINT`. |
| `src/services/` (7,429 lines) | Peaks (4,193 bundled + live Overpass), trails (22 country indexes, 77,141 trails), conditions (Open-Meteo), imagery, assessment, checklist, operators. |
| `src/guides/` (2,596 lines) | Guide marketplace: directory, matching, requests, quotes, local bookings, the guide's own dashboard. |
| `src/network/` + `src/social/` | The Expedition Network, people, groups, feed, comments, leaderboards. Structurally empty — no backend. |
| `src/growth/` | Base / Pro €15 / Expedition €29, trial, paywall, the free readiness-test funnel. |
| `src/share/renderCard.ts` (1,858 lines) | Pure canvas. 13 activity layouts × 5 backgrounds × 4 formats. |
| `src/treks/` | 252 treks ported from web. **Generated — never hand-edit; see the protocol.** |
| `src/passport/`, `src/badges/`, `src/routes/` | Mountain Passport, badge model, route/trail detail. |

State is `localStorage` and nothing else: one React context (`src/state/AppState.tsx`,
1,521 lines) under key `icefall.state.v1`, plus ~11 module-level stores across 25
more keys. Supabase is wired, typed and migrated but unprovisioned — the client
is `null`, and **null is a supported state, not a bug**.

## Your work, in priority order

### 1. The honesty violations shipping ungated (do these first)
All verified 2026-08-28, all in a plain production build:

- **`src/screens/booking/` was never brought under the demo flag at all.**
  `Review.tsx:74` renders the fake `•••• 4242` Visa row that `Trial.tsx:15-33`
  explicitly bans. `data.ts:23` ships an invented guide — "Alex Martin", 4.9★,
  127 reviews, a UIAGM licence — and `data.ts:38` a **fabricated verification
  record with a specific date**: *"Documents checked by ICEFALL on 5 Jun 2026."*
  Reachable from `chat/Thread.tsx:122`.
  → Note the owner has chosen the **5% service fee on top** model, which is what
  `/book` implements. So `/book` is the surviving flow — repair it rather than
  delete it, and reconcile the 12%-deducted path in `src/guides/` against it.
- **`src/tracking/feed.ts:119`** seeds career totals from `USER.stats`, so a
  fresh install's Profile shows 128 activities / 1,245 km / 78,540 m / 6 summits.
  This re-opens by a second path exactly the hole `state/AppState.tsx:558`
  deliberately closed (*"four summits they never climbed"*). Fix the class, not
  just the one path.
- **`src/screens/Nutrition.tsx`** renders fixture targets (2,800 kcal, 380 g
  carbs, hydration) with `loggedAt` timestamps so they read as recorded — while
  `NUTRITION_DISCLAIMER` and `IMAGE_ANALYSIS_NOTE` sit unused in
  `coach/nutrition.ts`. The hand-rolled substitute at `Nutrition.tsx:169-173`
  drops both load-bearing halves: no mention of medication/allergies/pregnancy/
  disordered eating, and no *"ICEFALL sets no weight or body-composition
  targets."* A meal-photo camera button ships without the note written to defeat
  exactly that expectation.
- **`src/screens/Expeditions.tsx:813-840`** renders a `BadgeCheck` tick, an
  invented ★ rating + review count and a "From €X" price behind `showClaims` —
  while the file header at `:51-54` still claims to individually refuse all three.
- **`src/screens/ActivityHistory.tsx`** never filters `simulated`, so simulated
  sessions count toward displayed totals. Second live violation of the simulated
  invariant. Every new aggregate over `RecordedActivity[]` must filter
  `!a.simulated` first.
- **`src/tracking/adapt.ts:91`** hardcodes `windKph: 0`, rendered by
  `cards.tsx:111` as "0 km/h" with no guard.

### 2. Finish the azure rebrand (owner decision #1)
Two files hold champagne-gold hex **under azure names**, which is why grepping
"gold" finds nothing and nobody noticed:
- `src/components/map/icefallStyle.ts:28` — `const AZURE = "#A78B5C"`,
  `OBSIDIAN = "#080B0D"`. The terrain map, route line and live marker are gold.
- `src/share/renderCard.ts:127-128` — `AZURE = "#A78B5C"`,
  `AZURE_BRIGHT = "#C9AC7B"`, `OBSIDIAN = "#080B0D"`. **Every share card an
  athlete exports renders in the retired brand**, while the picker copy at `:85`
  says *"Black and azure, very little else."*

Live values: `--ice-azure #4B9BFF`, `--ice-obsidian #05070B` (`src/index.css:44`).

### 3. Replace real company names with fictional ones (owner decision #2)
`src/services/operators.ts` — the `DEMO_PROFILES` block at `:323-503` and the
four demo entries. Elite Exped, Seven Summit Treks, Adventure Consultants and
14 Peaks Expedition are real businesses carrying invented ratings, prices,
summiteer counts and a "92% summit rate" pillar.

### 4. The known open list
1. `coach/nutrition.ts` — 1,740 lines imported by nothing. Start with `fuellingFor()`.
2. Decide the Coach chat's identity — real LLM behind a proxy, or drop the chat
   pretence for structured Q&A. Either way stop metering until it is worth paying for.
3. **No readiness is computable before ~day 14 and the app never says so.** A
   first-time user's first check-in drops into five empty states. Highest-impact
   first-run fix.
4. `GOALS` and `ACTIVITIES` fixtures are not DEV-gated.
5. `load.ts` computes a full acute/chronic history per day and throws away all
   but the last two numbers.
6. `matchesFor()` (route-repeat comparison) and `Sparkline` are finished and have
   zero call sites.
7. `Profile.tsx` has two dead links — `/daily` and `/activity/history`.
8. Duplicate `/explore/people/:id` — `App.tsx:291` redirect shadows `:296`
   `AthleteProfile` (819 lines of finished screen, unreachable).

## Hard invariants for your tree
- `DISCOVERABLE_ATHLETES` (now `src/network/directory.ts:19`) stays `[]`.
- Never pass `score.value ?? 0` to anything that takes a raw number — the
  `ReadinessDial` draws a dashed ring and `—` for a reason.
- **Do not "tidy" the demo-guides guard.** `src/guides/types.ts:241-263` reads
  `import.meta.env` *inline* on purpose; substituting a named constant defeats
  dead-code elimination and silently puts eight invented guides back in the
  production bundle. Verify with `grep -r "Falkenrath" dist/assets/`.
- Trail index files are rejected unless `json.v === 1` (`services/trails.ts:415`).
- The service worker is production-only — offline behaviour can only be verified
  with `npm run build` + preview on 5191, never the dev server.
- `globPatterns` in `vite.config.ts:34-40` is an **allowlist**; anything new in
  `public/` is not precached unless you add a pattern.

## Verify
```bash
cd icefall-app && npx tsc --noEmit
```
Then open it in the browser — in this project "verified" means looked at. Skip
the 11-step onboarding by setting `icefall.state.v1.onboarded = true` in
localStorage.
