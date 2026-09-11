# ICEFALL — the mountain pages, as they are

*11 September 2026. A brief for brainstorming, not an audit. Every claim checked against the code.*

## There are four surfaces, not one

| Route | File | What it is |
|---|---|---|
| `/explore/mountains` | `src/screens/Mountains.tsx` (574) | The list of 14 curated objectives + a peak search over 53,668 peaks |
| `/explore/mountains/:id` | `Mountains.tsx` → `MountainDetail` | A curated mountain, rendered by the shared page below |
| `/explore/peak/:id` | `src/screens/PeakDetail.tsx` (85) | Any of the 53,668 peaks, rendered by the same shared page |
| `/mountain/:goalId` | `src/screens/mountain/CommandCentre.tsx` (1,443) | **Your own objective.** A different page entirely |

Both detail routes render one shared component: `src/components/domain/MountainPage.tsx` (1,656 lines).
So "the mountain page" is really **one page with two data sources** — a curated record, or a peak
from the catalogue — plus a separate Command Centre for the mountain you're training for.

## What the shared page shows

In order: hero photo + name + elevation → a stats row (Difficulty, Best seasons, Duration,
Guide required / Can be climbed independently) → About → Photography → Treks here → Terrain →
What stands between you and the summit → Training this mountain asks for → Technical ground.

The last three only exist for the **14 curated** mountains. A peak from the catalogue has
coordinates, elevation and a name — so those sections are simply absent.

## What the Command Centre shows (your active objective)

Seven questions as section headings, which is a strong structure and worth keeping:
Expedition status · Am I physically ready · Do I have everything · What is the mountain doing ·
What is holding me back · What do I do today · Your next priority.

## The data you have to design with

`Mountain` (`src/types/index.ts:243`) — 14 records in `src/data/mock/mountains.ts`:

```
name, range, country, elevationM, coords
difficulty + difficultyLabel        bestSeasons[]        typicalDurationLabel
technicalRequirements[]  ← free text, e.g. "Comfortable on steep snow"
requiredExperience       ← free text
trainingRequirements[]   ← free text
recommendedGearIds[]     routes[]      conditions
requiresProfessionalSupport (bool)     permitIssuedToOperator (bool)
photo, photoCredit, summary
```

`MountainRoute` — `name, difficulty, gradeLabel, durationLabel, distanceKm, elevationGainM, description`.

**The three requirement fields are prose, not thresholds.** Nothing can compare an athlete against
them today; per-mountain readiness uses altitude bands, so Matterhorn and Toubkal score alike.
Structuring these is Phase 3 of the coach roadmap and it needs guide review.

## Problems worth fixing

1. **The photographs are hidden.** Every list card paints a scrim over the image at **0.96 opacity**
   (`scrim-bottom`, `Mountains.tsx` card). The images are fine — 1400px, fully loaded. You are
   looking at Everest through a lid. This is the single biggest visual win available.
2. **The list is 14 bordered boxes.** `rounded-card border border-hairline` on each, 150px tall and
   mostly empty because of (1). This file was not in the de-boxing pass. A mountain is a genuinely
   distinct object so it may keep a card — but the card should *be* the photograph, full-bleed,
   type over it, rather than a container with a picture inside.
3. **Two detail pages, one component, very different data.** A catalogue peak silently loses three
   whole sections. Worth deciding whether that page should say so.
4. **1,656 lines in the shared page, 1,443 in the Command Centre.** Any redesign is surgery on two
   large files.

## Factual note for materials, not design

The app has **14** curated mountains. The business plan and deck reportedly claim **52**.
The 53,668-peak catalogue is real but carries only name, elevation and coordinates.
