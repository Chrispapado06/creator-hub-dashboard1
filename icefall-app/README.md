# ICEFALL

The digital ecosystem for outdoor athletes and mountaineers — **Discover → Plan → Train → Perform → Explore → Achieve**.

Mobile-first React app designed at iPhone proportions, built to feel credible next to a €1,000 technical jacket.

```bash
cd icefall-app && npm run dev
```

Runs on **http://localhost:5190** (registered in the repo's `.claude/launch.json` as `icefall`).

> Don't run `npm run build` while the dev server is running — it serves the app unstyled.

---

## Stack

Matches the sibling sub-apps (`ofm-workspace`, `marketing-bible`):

| | |
|---|---|
| React 19 · Vite 7 · TypeScript 5.8 | same majors as the rest of the repo |
| Tailwind v4, CSS-first | `@theme inline` + oklch tokens in `src/index.css`, no `tailwind.config.ts` |
| `react-router-dom` v7 | `<BrowserRouter>` + `<Routes>`, `lazy()` per screen |
| `framer-motion` | **first use in this repo** — see *Design decisions* |
| Radix (dialog/tabs/slider/slot) | only where accessibility is hard; everything visual is bespoke |

No Supabase, no auth, no payments. Bookings and purchases are realistic UI that stop short of transacting.

---

## Architecture

```
src/
  index.css              design tokens — the whole visual language starts here
  types/                 domain model; every screen reads these shapes only
  data/mock/             fixtures (real mountains, real elevations)
  services/
    repository.ts        THE SEAM — swap fixtures for HTTP here, screens don't change
    coach.ts             ICEFALL Coach: scripted, context-aware, optional server proxy
  tracking/              the live activity tracker (see below)
  share/renderCard.ts    canvas share-card renderer, 5 layouts × 3 formats
  state/AppState.tsx     onboarding + progress, persisted to localStorage
  lib/geo.ts             deterministic synthetic GPS for the seeded fixtures
  components/ui/         design system primitives + hand-built SVG charts
  components/domain/     ActivityCard, GoalCard, MountainCard, GearCard, …
  components/layout/     PhoneShell, TabBar, Screen/ScreenHeader/SegmentedTabs
  screens/               the screens, incl. screens/tracker/
```

### The tracker

```
tracking/
  types.ts        domain model — activities, metrics, samples, snapshots
  activities.ts   27 activity types across 8 families; each declares its metrics
  metrics.ts      metric registry + readMetric() — the availability rules live here
  filters.ts      GPS processing: accuracy gate, speed sanity, jitter floor,
                  altitude smoothing, elevation hysteresis
  recorder.ts     ActivityRecorder — the engine. No React anywhere in it.
  sources/        geolocation (real) · heartRate (Web Bluetooth, real) ·
                  health (Apple Health / Health Connect bridge) · simulator (labelled)
  points.ts       ICEFALL Points, with hard safety caps
  records.ts      personal records + achievements
  insights.ts     post-activity insight and live cues
  finalize.ts     score → detect → persist, in one place
  useRecorder.ts  the only React binding
  adapt.ts        recorded → display Activity, so existing screens just work
```

**`ActivityRecorder` imports nothing from React.** Sources push samples in; the
engine exposes an immutable snapshot; the hook mirrors it. That separation is what
lets the same logic later run in a native background service, or replay a Garmin
FIT import, without touching a screen.

**Activity type is not a label.** It selects which metrics appear and in what
priority, sets the GPS speed ceiling used for jump rejection, decides whether the
layout is built around distance or vertical, and determines whether location is
requested at all — indoor activities never ask.

**Screens never import `src/data` directly.** They go through `services/repository.ts`, whose
every method is already `async` — so replacing fixtures with a real API touches that one file.

### Navigation

Exactly five primary destinations, constant on every screen:
**HOME · ACTIVITY · COACH · EXPLORE · PROFILE**

The other eleven surfaces hang off them rather than adding a sixth tab:

- **COACH** → `Coach · Training · Nutrition`
- **EXPLORE** → `Mountains · Expeditions · Events · Community`
- **PROFILE** → achievements, Gear locker + catalogue, ICEFALL Private, settings

---

## Design decisions

**Dark only.** The `.dark` scaffolding is in place, but ICEFALL ships one cinematic theme. A light
mode would dilute the brand, not extend it.

**Colours must be oklch** — the repo's house rule. `src/index.css` documents the palette derived
from the brand reference (`#080B0D · #111214 · #1C1D20 · #E6E6E6 · #A78B5C`).

**One accent, used sparingly.** Champagne gold marks the active tab, progress, and at most one
call to action per screen. Restraint is what makes it read as luxury rather than as a dashboard.

**Charts are hand-built SVG, not Recharts.** The reference's charts are hairline-thin
instrumentation; a charting library fights that at every step. Each primitive is ~80 lines.

**Maps are real, and keyless.** `TerrainMap` (`src/components/map/`) runs MapLibre GL against a
hand-written dark alpine style: vector tiles from **OpenFreeMap**, elevation from the public **AWS
terrain tiles**. Both are free and require no token, so nothing secret ships. Tilt the camera and
you get true 3D relief driven by real elevation — climb a thousand metres and the ground rises
under the route. Peaks render with their real names and heights, which is the single most ICEFALL
thing on the map.

> **Pin MapLibre to v5.** v6 does not work here: its tile worker never initialises, so vector tiles
> are silently never requested — no error, no console warning, just an empty basemap while raster
> DEM tiles load fine. Diagnosing that cost real time. `maplibre-gl: ^5` is deliberate.

Both sources require attribution, which the component renders. The style is validated against the
MapLibre spec (`validateStyleMin`) — worth re-running after any edit.

**`RouteMap` is still the fallback.** The procedural contour renderer remains, and `TerrainMap`
drops to it when tiles can't load, so an activity is never blocked by a map. Only errors *before*
the style loads are fatal — a missing DEM tile over the sea is routine and must not tear the map
down.

**Synthetic GPS is effort-weighted.** `lib/geo.ts` distributes a session's duration by gradient,
not evenly — otherwise every kilometre split comes out identical, which is not what a mountain day
looks like. A Gran Paradiso ascent now reads 1:22 on the steepest kilometre and 17:43 on the descent.

**framer-motion, deliberately.** Nothing else in this repo uses it (house animation is
`tw-animate-css` + CSS keyframes), and CSS would cover rings and fades. It earns its place for
drag-dismissable sheets, `AnimatePresence` exits and orchestrated staggers. This is an isolated
package, so it cannot affect the flagship dashboard. One easing curve, 240–320 ms,
full `prefers-reduced-motion` bypass.

**Avatars are initials, not photographs.** Attaching real people's faces to fictional community
members would misrepresent them.

**Gear renders as typographic studio tiles.** The ICEFALL range is fictional in this build; using a
photograph of another brand's jacket to stand in for it would misrepresent both. Real product
shots drop straight into `Product.photo`.

---

## Every mountain, not ten

`services/peaks.ts` discovers peaks from OpenStreetMap through two sources:

- **A bundled catalogue** — `public/data/peaks.json`, ~4,200 Alpine peaks above
  3,000 m (264 KB, lazily fetched). Instant, and works offline.
- **Live Overpass** — every named peak on earth, merged in behind the instant
  results. Three mirrors, because Overpass instances go down regularly.

Rebuild the catalogue with `npm run peaks` (add `--world` for the major ranges
too — slower, and it retries through flaky mirrors). Data © OpenStreetMap
contributors, ODbL; the attribution is rendered wherever peaks are shown.

**Near me** on Explore asks for location once, sorts by distance, and never
stores or transmits the position.

### Derived assessment

OSM gives a peak a name, a position and a height — nothing about difficulty or
kit. `services/peakAssessment.ts` derives a seven-band assessment from elevation
and latitude: grade, what you need to know, technical kit, the ICEFALL clothing
system, season window and acclimatisation guidance.

Season comes from latitude rather than a guess — a 4,000 m peak in Patagonia
doesn't share a window with one in the Alps, and the tropics have neither.

**It is an estimate and every screen says so.** It describes the *class* of
mountain, not a route: an easy line and a desperate one share a summit. The ten
curated mountains keep their hand-written route detail and are linked to instead
whenever a discovered peak matches one.

## Training is generated, not fixed

`tracking/training.ts` builds the plan from whatever objective is active — length
from the target date, volume scaled by the mountain's difficulty, blocks
proportioned Base → Build → Peak → Taper. Pick the Matterhorn or write your own
objective and you get a plan for *that*, which was not previously true.

Sessions tick themselves off when a recorded activity did the work (60% of what
was prescribed counts), and the Training screen marks those **Recorded** so the
connection is visible.

**Goal preparation is derived**, not a stored number, from three parts shown to
the athlete so the figure is never a mystery:

- *Consistency* — sessions completed, weighted by how many ICEFALL could
  actually observe. A goal set this morning can't score well on three sessions.
- *Capability* — the weaker of single-day ascent and altitude reached against
  what the objective demands. Judging on ascent alone once rated Everest better
  prepared than Mont Blanc.
- *Time in the build* — how far through the plan you are.

Nothing is pre-ticked. Sessions from before there was any activity data are
excluded from the denominator rather than counted as done.

## Measurement honesty

The single most important rule in the tracker: **never show a number that wasn't
measured.**

- Every metric resolves through `readMetric()` to a value *or* a reason —
  `no-sensor`, `no-gps`, `indoor`, `awaiting-signal`, `not-connected`,
  `needs-permission`. The UI renders the reason, never a zero.
- Calories are the one modelled value, computed from a MET estimate, and are
  labelled **est** wherever they appear.
- GPS quality is surfaced continuously (`Excellent / Good / Weak / No signal`)
  with the raw accuracy in metres. Signal loss shows a non-blocking warning and
  timing continues; distance resumes when a fix returns.
- The simulator exists so the tracker can be reviewed indoors. Anything it
  produces is badged **SIMULATED** on the live screen, in the summary, and burned
  into the exported share card.

Elevation deserves a specific note: raw GPS altitude drifts by a metre or two per
sample, and naive summation invents hundreds of metres of ascent over an hour.
`filters.ts` smooths altitude exponentially and then applies a 3 m hysteresis
threshold against a moving anchor, so only real changes are banked.

## ICEFALL Points — and why they're capped

Points are not distance. Completion, time, distance, vertical, vertical
milestones and weekly consistency all contribute, weighted by how hard the ground
is (5 pts/km mountaineering, 1.4 pts/km road cycling).

**Safety is part of the scoring spec.** Points must never make it rational to
keep going when an athlete should stop, so time caps at five hours, distance at
60 km, and vertical at 3,000 m per activity — and the cap is shown to the user in
the breakdown when it bites. There are no multipliers for finishing late, for bad
weather, or for streak length. Vertical milestones are thresholds rather than a
slope, so there's never a reason to squeeze out "just a bit more" on tired legs.

## Health integration

`tracking/sources/health.ts` defines a small `HealthBridge` contract and drives it
when a native container is present — Apple HealthKit on iOS, Health Connect on
Android — for steps, walking distance, floors, active energy, exercise minutes,
resting heart rate and sleep.

**No browser can read a step count.** On the web the screen says exactly that and
offers a clearly-labelled sample dataset for design review, rather than inventing
numbers. To wire it up for real under Capacitor:

- iOS — `@perfood/capacitor-healthkit`, HealthKit capability, `NSHealthShareUsageDescription`
- Android — `capacitor-health-connect`, Health Connect permissions in the manifest

Adapt either plugin to `HealthBridge` and nothing else changes. ICEFALL only ever
reads, never writes, and asks for the seven values it actually displays.

## Honesty constraints

These are product requirements, not disclaimers bolted on:

- The Coach **never** substitutes for a doctor or a certified guide. Answers touching medical
  judgement, altitude, or high-consequence terrain carry an explicit deferral (`services/coach.ts`).
- ICEFALL is a **discovery layer** for expeditions, never the operator. Every expedition resolves
  to an independent certified partner.
- ICEFALL Private promises no expeditions — those belong to professional operators.
- Conditions shown in-app are labelled indicative, with a prompt to check a dedicated
  mountain forecast.

---

## Coach

Scripted and context-aware by default, reading the athlete's real week, goal and prescribed session.
To swap in a model, set a **server-side** proxy:

```bash
VITE_COACH_ENDPOINT=https://your-proxy.example/coach
```

It receives `{ question, context }` and returns `{ body, disclaimer? }`. If it errors, the app
falls back to the scripted coach rather than showing a failure. No API key is ever exposed to the
client.

---

## Photography

21 images in `public/img/`, ~5.4 MB total, all from Wikimedia Commons — mostly CC0 Unsplash
imports. Sources and licences are in [`public/img/CREDITS.md`](public/img/CREDITS.md).

Each was picked automatically **and then checked by eye**: the automated passes returned a Zermatt
museum building, a painted relief map, an 1877 engraving, a military exercise, the *Oregon*
Matterhorn, and an alpine chough — all rejected. Files marked CC BY / CC BY-SA require the
attribution recorded in CREDITS.md wherever they're shown publicly. Re-verify licences before any
commercial launch and replace with ICEFALL's own photography where possible.

---

## Verification

```bash
npx tsc --noEmit   # clean
npm run build      # clean — stop the dev server first
```

All 19 routes were walked in the browser with zero runtime console errors.

---

## Not done yet

- Real backend, auth, payments
- Live GPS, HealthKit / wearables
- Push notifications
- Capacitor wrapper for App Store / Play distribution (the architecture supports it; no rewrite needed)
