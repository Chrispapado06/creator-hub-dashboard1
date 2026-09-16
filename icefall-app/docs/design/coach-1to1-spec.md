# Coach redesign — the owner's brief plus a literal transcription of the mockups

**16 Sep 2026.** The owner sent 7 mockup images (Coach Hub, Chat, Plan·Schedule,
Plan·Progress, Fuel, the Objective sheet, the About-this-coach sheet) and a
written brief, then said: *"make mockups 1:1 on the page I dont want to go back
and find mistakes."* This file has two parts: **Part A** is the owner's brief,
copied in full so it lives in the repo where every builder can read it. **Part
B**, below it, is a screen-by-screen transcription of exactly what the images
show — written by the person who could see them, for builders who cannot,
following the same method that worked for the Mountain mode mockups
(`docs/design/mountain-mode-mockups.md`). **Build to both. Part B is the literal
ground truth for copy, order and layout; Part A is the ground truth for colour,
data rules and quality bar.**

The images themselves are NOT saved anywhere in this repo or on a path any
builder can open — they were pasted directly into chat. Do not go looking for
a PNG. Everything that was in them is transcribed in Part B.

---

# PART A — the owner's brief, verbatim

# Task: Rebuild the ICEFALL Coach section (hub + sub-pages)

Rebuild the Coach section so it matches the mockup's **layout, structure and
components**. Use ICEFALL's **existing dark theme**, not the mockup's light
colours. The mockup is a layout reference only. Colours and fonts come from
the app.

## 0. Before coding
1. Explore the repo.
   - Find the framework, router, styling approach (CSS vars, Tailwind, etc.)
     and theme/token files.
   - Find the current Coach routes. `/coach`, `/coach/progress` and any
     today/chat/fuel/plan pages exist today.
   - Find where plan, session, fuel and chat data come from.
2. Reuse the existing theme tokens, fonts, icons and components wherever they
   exist. Don't hardcode values that already exist as tokens.
3. Write a short plan listing:
   - files to change
   - new routes
   - components to create
4. Then build.

## 1. Structure (matches the mockup)
| Screen | Route (adapt to existing naming) |
|---|---|
| Coach Hub | `/coach` |
| Chat | `/coach/chat` |
| Plan, with segmented **Schedule \| Progress** | `/coach/plan` and `/coach/plan?view=progress` |
| Fuel | `/coach/fuel` |
| Objective sheet | bottom sheet, opened from the objective chip |
| About this coach sheet | bottom sheet, opened from the hub |

- **Old routes:** redirect the old Today and Progress routes to the hub and to
  Plan → Progress respectively.
- **Removed from the hub:**
  - the 2×2 photo-tile grid
  - the old hero
  - the big Plan photo card

### Coach Hub (top to bottom)
1. **Header**
   - Avatar and name.
   - Objective chip: "Mont Blanc · 242 days ›", which opens the Objective
     sheet. This chip is the only place the objective can be changed.
   - Search, messages and bell icons.
2. **Hero card: "Today · Wed 16 Sep"**
   - Mountain photo under a dark gradient.
   - Session title.
   - Chips: 38 min / Base 4 / Deload.
   - One-line reason.
   - Row of exercise tiles.
   - Full-width **Start session** button plus a **Swap** button.
3. **This week card**
   - "1 of 6 sessions · 14–20 Sep".
   - 6-segment progress bar and "5 left".
   - Tapping it goes to Plan.
4. **Ask your coach card**
   - Subtitle.
   - 3 suggestion chips. Tapping a chip opens Chat with that question
     pre-sent.
5. **Fuel today card**
   - Energy range plus a "Nothing logged yet" state.
   - Tapping it goes to Fuel.
   - This card isn't visible in the mockup crop, but include it below Ask
     your coach.
6. **"About this coach" row**, which opens its sheet.

### Chat
- **Top bar:** "‹ Coach", title, overflow menu.
- **Context line:** "Mont Blanc · Week 12 · Base".
- **Trust row:**
  - Pill: "Private · not shared to Social".
  - Pill: "What I remember (N) ›", which opens a sheet listing memories with
    delete.
- **Messages:**
  - Coach bubbles have the logo avatar.
  - Coach bubbles can show a source footnote, e.g. "Based on 13 logged
    sessions".
  - User bubbles are right-aligned.
- **Composer:**
  - Suggestion chips above the input.
  - Input with send button.
  - A **single** usage meter under it: "6 of 8 coach messages left today"
    with a progress bar.
- **Remove the old limit:** delete the "3 free conversations left this month"
  counter entirely. Keep one credit model.
- **Meter states:**
  - Amber when 2 or fewer remain.
  - Disabled input when 0 remain, with the reset time shown.

### Plan: Schedule view
- **Controls:**
  - Segmented control.
  - Week switcher: "‹ Week 12 · 14–20 Sep ›".
- **Day rows:**
  - Each row shows day/date, session name, "duration · type" and a status
    icon.
  - Status icons are: completed check, today dot, or empty circle.
  - Each row has a ⋯ menu.
  - The today row is highlighted and opens the session detail with **Start
    session / Mark done**.
- **Deload callout card:** shown at the bottom when the week is a deload.

### Plan: Progress view
- **Ring card:** % complete, "Week 12 of 46", days completed/remaining.
- **Stat row:** logged / remaining / weeks.
- **Milestones list:** Base / Build / Peak / Expedition, each with a week
  range and status.

### Fuel
- **"Today's fuel" card:**
  - Training-day badge.
  - Big range "2,150 – 3,800 kcal", shown as a range, never "2,150+".
  - Subline.
- **Empty state:**
  - Icon and "Nothing logged yet".
  - **Log food** button (primary).
  - **View nutrition tips** button (secondary).
- **"Why this range?" card.**
- **Target selector:** keep the existing Performance / Maintenance /
  Recovery selector and its copy, which says ICEFALL sets no weight or
  body-composition goals.
- **When food is logged:** show consumed as a marker on a horizontal band.
- **Tone:** no red "over" states and no guilt copy.

### Sheets
- **Objective sheet:**
  - Photo.
  - Mont Blanc / Serious alpine / 242 days to go.
  - **Change** button.
  - Info note: "Changing your objective will update your plan, but your
    logged data will be kept."
- **About this coach sheet:**
  - "A planning aid, not a measurement": cannot judge recovery, injury or
    altitude.
  - "Answers from your data."

## 2. Colours: use the app's dark palette, NOT the mockup's light one
Use the existing theme tokens first. If a token is missing, add it using
these values, which were sampled from the current app:

| Role | Hex |
|---|---|
| App background | `#07080D` |
| Card | `#11141C` |
| Card-alt, raised surfaces (chips, inactive segments, input fields, exercise tiles, sheets) | `#171B25` |
| Hairline borders and dividers | `#232B3A` |
| Accent: primary buttons, active segment, active tab, send button, meter fill, today dot | `#5B8DEF` |
| Accent-dim: highlighted "today" row background (at ~35% opacity), user chat bubble | `#34518C` |
| Accent-soft: links ("Change", "View full plan"), chip text, context line | `#9CBCF7` |
| Headings and primary text | `#FFFFFF` |
| Body text | `#D2D9E6` |
| Muted / secondary text | `#8892A6` |

Other colour rules:
- **Success** (completed checks, "Complete"): use the app's existing green
  from the "Completed" pill.
- **Caution** (low meter, deload bulb icon): use the existing amber/orange
  if one exists, else `#E7B24F`.
- **Photo cards:** use a bottom gradient from transparent to `#07080D` at
  ~85% so white text passes contrast.
- **Map every light surface in the mockup to its dark equivalent.** There
  should be no white or light-grey cards anywhere. The Objective and About
  sheets use `#11141C` with a `#232B3A` border and a dimmed backdrop.

## 3. Typography & style
- **Fonts:** keep the app's current fonts.
  - The serif display face is for page titles ("Coach", "Plan", "Fuel") and
    the hero session name.
  - The existing sans is for everything else.
- **Kickers:** keep the small letter-spaced caps kickers the app already
  uses, sparingly.
- **Shapes:**
  - Cards: 16–20px radius with a 1px hairline border.
  - Pills and chips: fully rounded.
  - Spacing on an 8px grid.
- **Icons:** use the app's existing icon set.
- **Bottom tab bar:** keep the current one (Home, Explore with compass,
  Play, Coach with chat bubble, Social). Don't copy the mockup's tab icons.

## 4. Must-fix rules
1. **Tab bar never covers content.**
   - Add bottom padding equal to tab bar height plus the safe-area inset on
     every Coach screen.
   - No button (Start session, Mark done, Log food, chat input) may sit
     under it.
   - On Chat, the composer sits above the tab bar, or the tab bar hides on
     that screen. Pick whichever the app already does for full-screen
     flows.
2. **One source of truth for numbers.**
   - Compute every count, week, percentage and day total from the same
     plan/objective data via a shared selector or hook.
   - Hub, Schedule and Progress must always agree.
   - Do NOT copy the mockup's numbers. Several conflict:
     - "13 logged / 243 remaining" vs "45%".
     - "Base phase Weeks 1–12 · Complete" while still in week 12.
     - 106 + 136 days vs 242 days to go.
     - Schedule session names differ from the real plan.
   - Pull the real sessions from the existing data.
   - Label the % as "of prescribed sessions — not a readiness figure".
   - A phase is only "Complete" after its last week ends.
3. **Objective appears once.** The editable chip lives on the hub. Sub-pages
   show only the slim, non-editable context line.
4. **One chat limit.** See the Chat section above.
5. **Fuel shows a range, never a single "+" number.**

## 5. States to build
- **Hub hero:** rest day, deload day, missed session (neutral, no shaming
  copy), session done.
- **Chat:** empty, sending/loading, near limit, limit reached, "not logged"
  answer.
- **Fuel:** nothing logged, partially logged.
- **All data cards:** loading skeletons and error states.

## 6. Quality bar
- **Layout:** mobile-first at 390px. It must still work at 360px and inside
  the existing desktop phone frame.
- **Accessibility:**
  - WCAG AA contrast on the dark backgrounds. Check muted text on
    `#171B25`.
  - Tap targets of at least 44px.
  - Visible focus states.
  - Aria labels on icon buttons.
  - The segmented control uses `role="tablist"`.
- **Motion:** respect `prefers-reduced-motion`.
- **Finish with:**
  - Run the app and check every route.
  - Run lint and typecheck, and fix issues.
  - Give a short summary of what changed.
  - List any data the mockup needs that the app doesn't have yet. Leave a
    clear TODO rather than inventing numbers.

---

# PART B — literal transcription of the 7 mockup images

General mockup conventions, true across every screen: status bar reads 9:41
with signal/wifi/battery glyphs (ignore — real device chrome). Every screen
below the hub has the same top bar shape: **"‹ Coach"** back control at the
left (chevron + word "Coach"), the page's own title centred ("Chat", "Plan",
"Fuel"), and a **"⋮"** overflow-menu icon at the right. Every screen (except
the two sheets) ends in the same 5-tab bottom bar: Home · Explore · a raised
circular centre Play/Start button · Coach (active, filled/underlined) ·
Social.

## B1. Coach Hub

**Header row:** circular avatar with initials "CH", name **"Christofis"**
bold beside it, and directly under the name a smaller tappable line
**"Mont Blanc · 242 days ›"** (this is the objective chip — the brief's §1
says this chip is the ONLY place the objective can change). Right-aligned on
the same row: a search (magnifying-glass) icon, a message/chat-bubble icon,
a bell icon.

**Hero card:** a mountain photograph fills the top of the card under a dark
gradient. Inside the photo area, top-left: a small mountain glyph plus
**"Today · Wed 16 Sep"**. Below the photo, on the card's own (non-photo)
surface: **"Strength — Lower Body"** as a large heading, then a row of three
pill chips — **"38 min"**, **"Base 4"**, **"Deload"** — then one grey line of
reasoning: *"Deload week: 65% of your usual block load so earlier weeks are
absorbed."* Below that, four equal square-ish tiles in a row, each an icon
over a label: a walking-person glyph over **"Split squats"**, a stepping/stair
glyph over **"Step-ups"**, a flexing glyph over **"Calf raises"**, a
circular/core glyph over **"Core"**. Under the tiles, two buttons side by
side: a wide filled primary **"Start session"** and a narrower outlined
**"Swap"**.

**This week card:** the line **"1 of 6 sessions · 14–20 Sep"**, then a
6-segment horizontal bar (segment 1 filled, segments 2–6 empty), with
**"5 left"** set beside/under it. The whole card is tappable through to Plan.

**Ask your coach card:** a small icon + heading **"Ask your coach"** with a
trailing chevron, a grey subline *"Get personalised guidance from your
training data."*, then three wrapping suggestion-chip buttons: **"What
should I train today?"**, **"Am I ready for Mont Blanc?"**, **"Why a
deload?"**. Tapping one opens Chat with that question already sent (brief
§Coach Hub item 4) — the image crop ends here; the brief's own text is the
source for the Fuel-today card and the About-this-coach row that follow
below it (item 5–6), so build those from the brief's words, not from
anything pictured.

## B2. Chat

Top bar **"‹ Coach"** / **"Chat"** / **"⋮"**. Context line, small and grey:
**"Mont Blanc · Week 12 · Base"**.

**Trust row**, two pills side by side: a lock-icon pill reading **"Private ·
not shared to Social"**, and **"What I remember (0) ›"**.

**Thread**, top to bottom:
1. Coach bubble (small circular ICEFALL mountain-logo avatar to its left):
   *"Hi Christofis! I'm your ICEFALL coach. I'll answer from what you've
   logged and use your plan to give tailored guidance. If something isn't
   logged, I'll say so rather than guessing."* — timestamp **9:41** under it.
2. User bubble (right-aligned, filled accent colour): *"What should I focus
   on this week?"* — timestamp **9:41**.
3. Coach bubble: *"You're in a deload week (Week 12), so the focus is on
   maintaining consistency while reducing load."* followed, inside the same
   bubble, by a bulleted list — **"Keep 6 sessions this week"** /
   **"Focus on quality movement"** / **"Prioritise sleep and nutrition"** —
   then a small source footnote **"Based on 13 logged sessions"** and
   timestamp **9:41**.

**Composer area:** three suggestion chips above the input — **"Why a
deload?"**, **"Am I ready for Mont Blanc?"**, **"How should I fuel
tomorrow?"** — then the input row itself, placeholder **"Ask your coach…"**
with a circular send button (arrow glyph). Directly under the composer, the
**single** usage meter: a small chat-bubble icon + **"6 of 8 coach messages
left today"**, with a horizontal progress bar beneath it (mostly filled).
There is no second/old counter anywhere on this screen — the brief's §Chat
"Remove the old limit" instruction means literally nowhere on this page,
including scrolled states.

## B3. Plan — Schedule view

Top bar **"‹ Coach"** / **"Plan"** / **"⋮"**. Context line **"Mont Blanc ·
Week 12 · Base"**. Segmented control, **Schedule** active (filled) /
**Progress** inactive. Week switcher: **"‹  Week 12 · 14–20 Sep  ›"**.

Seven day rows, each: day abbreviation + date stacked small at the left
(e.g. "Mon" / "14 Sep"), then the session name (bold) with a grey
"duration · type" line under it, a status glyph at the right (green check /
blue dot / empty ring), and a **"⋯"** icon at the far right edge. Exact rows
shown:

| Day | Session | Detail | Status |
|---|---|---|---|
| Mon 14 Sep | Rest | Recovery and mobility | ✅ complete |
| Tue 15 Sep | Zone 2 | 45 min · Endurance | ✅ complete |
| Wed 16 Sep | **Strength — Lower Body** | 38 min · Base 4 · Deload | 🔵 today — **row highlighted**, chevron visible, opens session detail |
| Thu 17 Sep | Upper Body | 40 min · Base 4 | ◯ upcoming |
| Fri 18 Sep | Zone 2 | 45 min · Endurance | ◯ upcoming |
| Sat 19 Sep | Long Hike | 3–4 hrs · Specific | ◯ upcoming |
| Sun 20 Sep | Mobility | 20 min · Recovery | ◯ upcoming |

**These day names, session titles and numbers are EXAMPLES from the mockup —
the brief's §4.2 explicitly says do not copy them; pull the real week's real
sessions.** What must be copied is the row's shape (day/date, name, detail
line, status glyph, ⋯ menu) and that the today row is visually distinct and
opens straight into a session detail with **Start session / Mark done**.

**Deload callout**, shown at the bottom only in a deload week: a light-bulb
icon, bold **"Deload week"**, grey subline *"65% of your usual block load so
earlier weeks are absorbed."*

## B4. Plan — Progress view

Same top bar, context line, segmented control (now **Progress** active).

**Ring card:** a circular progress ring with **"45%"** centred inside it;
beside/under it **"Week 12 of 46"** bold, then two lines **"106 days
completed"** / **"136 days remaining"**.

**Stat row**, three equal tiles: a check-icon tile **"13"** / **"logged"**, a
calendar-icon tile **"243"** / **"remaining"**, a mountain-icon tile **"46"**
/ **"weeks"** (number large, label small under it).

**Milestones list**, heading **"Milestones"**, four rows, each a phase name
+ its week range on the left and a status word + glyph on the right:

| Phase | Weeks | Status |
|---|---|---|
| Base phase | Weeks 1–12 | **Complete** ✅ |
| Build phase | Weeks 13–28 | Not started ◯ |
| Peak phase | Weeks 29–40 | Not started ◯ |
| Expedition | Weeks 41–46 | Not started ◯ |

**Every number on this screen conflicts with itself and with the Hub/Schedule
numbers** (the brief's §4.2 lists the exact conflicts: 45% vs 13/243, Base
phase marked Complete while still literally in week 12 of Base per the
Schedule view, 106+136≠242). This is not a rendering bug to preserve — it is
the mockup's own placeholder data being self-inconsistent. Build the ring,
the stat row and the milestone list to real computed numbers from one shared
source, per §4.2, so all of this actually agrees with itself and with the
Hub and Schedule screens.

## B5. Fuel

Top bar **"‹ Coach"** / **"Fuel"** / **"⋮"**. Context line **"Mont Blanc ·
Week 12 · Base"**.

**Today's fuel card:** a fork-and-knife icon + **"Today's fuel"** on the
left, a **"Training day"** pill badge on the right; below that the big range
**"2,150 – 3,800 kcal"**, then a grey subline *"Your energy target for
today."*

**Empty state card:** a centred, muted plate/apple glyph, bold **"Nothing
logged yet"**, grey subline *"Log your meals to track your energy and
support your training."*, then a full-width filled primary button **"Log
food"** and, under it, an outlined secondary button **"View nutrition
tips"**.

**Why this range? card:** bold **"Why this range?"** with a grey subline
*"Based on your training plan, duration and intensity for today."*

(The brief's §Fuel also names the existing Performance/Maintenance/Recovery
target selector and the logged/partially-logged states as things to keep/add
— those are not in this particular crop; build them per the brief's words.)

## B6. Objective sheet

A bottom sheet: small grey drag-handle bar at the top centre, **"✕"** close
at the top right, heading **"Your objective"** bold, grey subline *"This is
your current goal. You can update it any time."*

Below that, a photo card (Mont Blanc), with **"Mont Blanc"** bold and grey
**"Serious alpine"** under it, and a right-aligned outlined **"Change"**
button.

Then an info note in a tinted rounded box with a small "i" icon: *"Changing
your objective will update your plan, but your logged data will be kept."*

## B7. About this coach sheet

Same sheet chrome: drag handle, **"✕"** close, heading **"About this
coach"** bold.

Two rows, each an icon + a bold line + a grey explanatory line under it:
1. Mountain-glyph icon — **"A planning aid, not a measurement"** — *"I help
   you plan and stay consistent based on what you've logged. I can't judge
   recovery, injury or altitude response."*
2. Shield-check glyph — **"Answers from your data"** — *"I only use your
   logged data. If something isn't logged, I'll say so rather than
   guessing."*

---

# What the owner said about verification

*"When sub agents finish then you go page by page verify screenshot and
compare."* This means the orchestrating session, not a sub-agent, takes real
screenshots of the running app and compares them against this transcription
(and the owner's own memory of the images) screen by screen before calling
this done.
