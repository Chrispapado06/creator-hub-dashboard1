# Mountain mode — the owner's mockups, transcribed

**16 Sep 2026.** The owner reviewed the built Mountain mode and said: *"offline mode
is horrible so confusing — I sent you mockups to copy."* He then sent six mockup
images covering every Mountain mode screen.

This file is a **transcription of those images**, written by the person who could
see them, for the builders who cannot. Where the image is ambiguous it says so
rather than guessing. **Build to this file.**

---

## 0. THE SHARED LANGUAGE (read before any screen)

### What makes the mockups clearer than what we built
Each screen has **one hero** — a single very large number or word — and everything
else is a quiet row beneath it. The built version spreads several medium-sized
things evenly, which is why it reads as confusing. Copy the hierarchy, not just
the colours.

### Colours (from the images)
| Role | Value | Where it appears |
|---|---|---|
| Ground | near-black, effectively `#000` | every screen |
| Primary action | vivid azure, ICEFALL's own `#4B9BFF` | START AN ACTIVITY, SYMPTOM CHECK, CHECK HOW I FEEL, RETRACE MY ROUTE, active tab, route label caps |
| Emergency | vivid red | SOS button, EMERGENCY header bar, CALL 112 |
| Caution | amber | turnaround alarm, UNWELL, hazard pins, "LAST KNOWN" stale position, BEHIND PLAN |
| Primary text | white | hero numbers, row titles |
| Secondary text | mid grey | sub-lines, units, section labels |

Separators are **hairlines between rows**. There are **no boxes around rows**
anywhere in these mockups — this matches the owner's standing rule. The only
bordered/filled rectangles are: buttons, the amber alarm frame, the red EMERGENCY
bar, and the three symptom-state buttons.

### Type
- **Section labels**: small, UPPERCASE, letter-spaced, grey. e.g. `TURNAROUND`,
  `DAYLIGHT`, `ALTITUDE`, `NEXT`, `SAVED ON THIS PHONE`, `WHAT TO SAY`,
  `MY EMERGENCY INFO`, `YOUR POSITION`, `TONIGHT`, `DRINK`, `EAT`.
- **Hero**: very large, tight line-height, white (or amber on the alarm).
- **Row title**: medium-weight white, with a grey sub-line under or a grey value
  right-aligned.
- **Big buttons**: UPPERCASE, letter-spaced.

### The header, on every in-mode screen
One row, three parts, left to right:
1. `MOUNTAIN MODE` — small, uppercase, letter-spaced, white.
2. A **pill** (rounded outline, no fill) reading `NO SIGNAL · ALL SAVED`.
3. A **red SOS button** — a rounded **rectangle**, not a circle, white bold `SOS`.

Battery sits as a **small grey percentage directly under the pill** (e.g. `32%`) —
it is not its own row. *(The built version uses a circular SOS, puts signal and
battery on their own full-width row, and has a dropdown chevron next to
"MOUNTAIN MODE". All three are wrong — match the mockup.)*

### The tab bar
Four tabs: **Now · Map · Body · Trip**. Active tab is azure with a short azure
underline above it. Icons in the final mockup are: Now = triangle/peak,
Map = folded map, Body = person, Trip = bar-chart/pack. The earlier mockups show
slightly different glyphs (stopwatch, heart, backpack) — **the peak/map/person/pack
set in mockup 6 is the newer one; use it.**

### HONESTY — this overrides the mockups
The mockups are filled with **example values**. Copy the layout and the wording
structure; **never hard-code the numbers.** Where a real value cannot be computed,
keep the honest empty state we already have, in the same visual slot — do not
invent a number to fill a pretty layout. Two specific cases are called out at
the end of this file. If a mockup element cannot be shown truthfully today, build
the slot and put the honest line in it, then report it.

---

## 1. BOOT SCREEN  (mockup 1, left)

Centred, vertically stacked, near-black:
- ICEFALL peak logo (existing asset) with the word `ICEFALL` letter-spaced below it.
- Hero: **`No signal`** — very large, white, mixed case (not caps).
- Sub-line: `Opening Mountain mode` — grey.
- A thin **azure progress bar**, roughly 1/3 filled.
- At the very bottom: `Open full app instead` — small, white, underlined link.

No header, no tab bar on this screen.

---

## 2. MOUNTAIN INDEX — nothing running  (mockup 1, middle)

Standard header. Then:

- Small grey caps label: `NO SIGNAL · NOTHING RUNNING`
- **`START AN ACTIVITY`** — full-width, filled azure, uppercase. Primary.
- **`OPEN SAVED TRIP · MONT BLANC`** — full-width, azure **outline**, transparent
  fill. *(The trip name is whatever trip is actually saved; if none is saved, this
  button is absent.)*
- **`SOS`** — full-width, red **outline**, transparent fill.
- Hairline, then grey caps label `SAVED ON THIS PHONE`, then flat chevron rows:
  - `This week's plan` ›
  - `Mont Blanc · Goûter route` ›
  - `Emergency info` ›

Tab bar at the bottom.

---

## 3. NOW TAB  (mockup 6 — two states)

Header. Then, top to bottom:

- Small azure caps: `DAY 2 · SUMMIT · MONT BLANC`
- Grey caps label `TURN AROUND IN`
- **Hero: `3:40`** — enormous, white.
- Grey sub-line: `Turnaround 11:00 · set by you`
- Hairline. `NEXT` (grey caps) / **`Vallot hut`** (white, large-ish) with
  `1.9 km · 520 m up` right-aligned in grey.
- Hairline. `DAYLIGHT` / **`9h 10m`** with `sunset 20:42` right-aligned grey.
- Hairline. `ALTITUDE` / **`4,180 m`** with `GPS ±8 m` right-aligned grey.
- Hairline. **Status line**, one of two:
  - azure: `ON PLAN · 20 min ahead`
  - amber: `BEHIND PLAN · summit ~40 min after turnaround`
- **`CHECK HOW I FEEL`** — full-width, filled azure, uppercase.

Note the value/unit treatment: `4,180 m` and `9h 10m` render the **unit in a
lighter grey** than the number.

**If no turnaround is set**, the hero slot keeps its shape and shows the existing
"No turnaround time set" + a set-it control — it must not collapse the layout.

---

## 4. TURNAROUND ALARM — full screen  (mockup 1, right)

The whole screen is framed by a **thick amber border**. Centred:
- Amber warning triangle icon.
- Amber caps: `TIME TO TURN AROUND`
- **Hero: `11:00`** — enormous, amber.
- Hairline. `SUMMIT` (grey caps) / `1h 20m` white + `away at your pace` grey.
- Hairline. `DAYLIGHT` / `7h left`.
- **`TURNING AROUND`** — full-width, **filled amber**, uppercase, dark text.
- `Snooze 15 min` — underlined white link below it.
- Footnote, grey, centred: `Your guide's call comes first.`

---

## 5. SOS SCREEN  (mockup 2 — two states)

This screen replaces the normal header with a **red bar**: centred white caps
`EMERGENCY`, and an `✕` close on the right.

- **`CALL 112`** — very large white text on a **filled red** full-width button,
  with a smaller white sub-line beneath it inside the same button naming the
  countries it covers, e.g. `France and Italy`. *(This comes from the real
  emergency dataset — never invent it. Where we hold nothing for a country, keep
  the existing honest gap wording.)*
- Grey caps `YOUR POSITION`, then **huge white coordinates on two lines**:
  `45.8326° N` / `6.8652° E`, with a small azure-outlined **`COPY`** button to
  their right.
- Grey sub-line: `45°49'57"N 6°51'55"E · GPS ±8 m · 14:21`
- **`SEND SMS WITH MY LOCATION`** — full-width azure outline button, with grey
  sub-line beneath: `SMS may work when data doesn't.`
- Grey caps `WHAT TO SAY`, then three plain white lines (no chevrons, no rows):
  `Where you are` / `What happened` / `How many people`
- Grey caps `MY EMERGENCY INFO`, then label/value rows, value right-aligned:
  `Emergency contact` → `Maria S.`
  `Insurance rescue` → `+00 000 0000`
  `Policy` → `sample reference`

**Stale variant (second image):** when the fix is old, the label changes from
`YOUR POSITION` to **amber `LAST KNOWN`**, the coordinates render **grey instead
of white**, and an **amber line** `Recorded 18 min ago` sits directly under them,
above the DMS line. Everything else is identical. This is the honesty rule made
visual — follow it exactly.

---

## 6. MAP TAB  (mockup 5 — two states)

Full-bleed dark terrain map under the header.

- Route drawn as a **dashed azure line** where it is ahead of you, solid where
  travelled.
- Labelled markers, white text beside a small glyph:
  `Mont Blanc 4,806 m` (peak triangle), `Vallot hut 4,362 m` (hut square),
  `Goûter hut 3,835 m` (hut square).
- Hazard: **amber warning triangle** with amber label `Grand Couloir · rockfall`.
- **Your position**: a white dot with a strong azure glow.
- Bottom-left, small grey: `MAP SAVED 2 DAYS AGO` and under it
  `Illustrative — not for navigation`.
- Bottom-right: a **scale bar** with `0 1 2 km` ticks.
- Two buttons across the bottom: filled azure **`RETRACE MY ROUTE`** and outlined
  **`CENTRE ON ME`**.

**Retrace active (second image):** the travelled track renders as a **white line
with small direction arrows** pointing back the way you came, and a block appears
above the buttons:
- grey caps `BACK TO GOÛTER HUT`
- **hero `1.2 km`** (white, large, unit lighter)
- grey `bearing 210° SW`
The left button becomes **`STOP RETRACE`**.

⚠️ **We cannot draw that terrain today** — no offline map source is licensed yet
(it is the open decision on the launch plan). Build every control, label, the
scale bar, the retrace block and the two states exactly as described, but where
the terrain would be, keep the existing honest "no map saved" state until a source
exists. Do **not** ship a fake or decorative terrain image.

---

## 7. BODY TAB  (mockup 4 — two screens)

### Body
- **`SYMPTOM CHECK`** — full-width filled azure button, at the **top**, above
  everything else.
- Grey caps `TONIGHT`, then `Sleep no higher than` and **hero `3,835 m`** (unit
  lighter), with grey `acclimatisation plan` right-aligned.
- A row of **three equal state buttons**, outlined, uppercase, wrapping to two
  lines where needed: `FEELING GOOD` · `SOME SYMPTOMS` · `UNWELL`. The selected
  one takes an **amber outline and amber text** (image shows UNWELL selected).
- Grey caps `DRINK` / hero-ish `1h ago`, with an azure-outlined **`LOG`** button
  right-aligned.
- Grey caps `EAT` / `2h ago`, same `LOG` button.
- An **amber-bordered notice** spanning the width, amber text, two lines:
  `Headache, nausea or confusion?` / `Tell your guide and descend.`
  *(Shown because UNWELL is selected — it is a response to state, not decoration.)*

### Symptom check (one question per screen)
- Top row: back arrow `←`, **five dots** with the current one filled azure, then
  `CANCEL` on the right. Under the dots, small grey `2 OF 5`.
- Grey caps `SYMPTOM CHECK`.
- **Hero question, enormous, white, uppercase: `HEADACHE?`**
- Four full-width **outlined** buttons, generously tall, uppercase:
  `NONE` / `MILD` / `MODERATE` / `SEVERE`
- Footnote with a small ⓘ, grey, centred: `This gives a score, not a diagnosis.`

---

## 8. TRIP TAB  (mockup 3 — two screens)

### Trip
- Small azure caps: `MONT BLANC · GOÛTER ROUTE · 12–14 JULY`
- Flat chevron rows, each a white title with a grey sub-line:
  - `ITINERARY` — `Day 2 of 3 · summit and descent`
  - `DOCUMENTS` — `Hut booking, insurance, permit`
  - `GEAR` — `12 of 14 packed`
  - `CONTACTS` — `Guide, operator, emergency`
  - `PHRASEBOOK` — `French · 8 phrases`
  - `JOURNAL` — `3 entries waiting to sync`
  - `COACH` — `Answers offline · 1 question queued`
  Row titles here are **uppercase**, unlike the index screen's rows.
- **`BACK DOWN — END TRIP`** — full-width outlined button at the bottom.

*(The built version's last row is "Open full app" — the mockup does not show it.
Keep it only if it still fits below the end-trip button; the owner has not said to
remove it.)*

### Documents sub-screen
- Sub-header row: `←` back arrow, centred caps title `DOCUMENTS`.
- Flat rows, chevron right, three lines each:
  `Hut booking` / `Goûter, 12 July` / grey `Saved on this phone`
  `Insurance` / `Policy ending 4417` / grey `Saved on this phone`
  `Permit` / `Not required on this route` / grey `Saved on this phone`

**This sub-screen sets the pattern for every other Trip sub-screen** (gear,
contacts, phrasebook, journal, coach): back arrow + centred caps title + flat
rows. Apply it to all of them.

---

## 9. THE TWO THINGS THE MOCKUPS SHOW THAT WE CANNOT HONESTLY FILL

Report both back rather than faking either.

1. **Pace vs plan** — mockup 6's `ON PLAN · 20 min ahead` / `BEHIND PLAN · summit
   ~40 min after turnaround`, and the alarm's `1h 20m away at your pace`. Our
   itineraries carry no timed splits, so a per-athlete pace comparison cannot be
   computed today. Build the slot; show the honest line we already have; say so.
2. **The terrain map** — see §6.

Everything else in these mockups is buildable from data we genuinely hold.
