# Mountain Mode — Step 1 plan

**Status: planning only. No application code, data or migration has been changed by this work.**
Everything below was read, measured or driven in a browser. Where a number appears, it was measured on this machine unless the text says otherwise.

---

## Before you read the rest

Three things matter more than anything else in this document.

**1. About 40% of what the brief asks for is already built.** The emergency phone numbers exist, sourced, for all fourteen mountains. The symptom check exists and already gives the right advice. The honest "is there a signal" logic exists. The service worker that saves the app to the phone exists. A Screen Wake Lock is already requested. An "Add to Home Screen" prompt is already written. None of this needs building. Section 1 lists it with file paths so nobody rebuilds it by accident.

**2. The part that is genuinely new is not the screens — it is the plumbing underneath them.** The app currently stores everything in a small browser bucket that holds about 5 MB in total, and a single long recording walks into that limit at roughly hour five and then fails silently. Journal photos, documents, breadcrumbs and a downloaded map have nowhere to live. Fixing that means moving every athlete's recorded history into a proper on-device database. That is the single biggest piece of work in the plan and it is invisible from the outside.

**3. A red-team pass found four ways this design would fail an athlete on a mountain, and they are corrected in the text below rather than listed at the end.** The worst was that the mode would not have opened at all in the exact conditions it exists for. Each correction is marked **CORRECTED** where it appears, and section 9 collects them in plain words.

The honest build size is **ten to fourteen weeks** for one experienced developer. There is a genuinely useful slice at **three to four weeks** (section 10) that delivers the entire safety case in the brief — turnaround countdown, daylight, symptom check, SOS with real numbers and coordinates — and needs no database, no offline map and no sync queue at all.

---

## 1. Current state — what already exists

### 1.1 Already built and directly reusable

| What the brief asks for | What already exists | Where |
|---|---|---|
| **M6** Emergency numbers per country, never guessed, each with a source | **All 14 mountains carry at least one sourced number.** The type will not compile a number without a source, so "never guess" is already enforced by the computer, not by discipline. The file has **zero imports** — verified — so it works with the radio off, the instant the app loads. | `src/data/mountainRescue.ts` |
| **M5 Body** The symptom check | The full Lake Louise altitude-sickness instrument: 4 scored questions, 5 red flags, escalation that fires before the form is finished, and it routes into the app's one altitude voice. Zero network reach, and that is machine-checked by a test, not asserted in a comment. | `src/trip/lakeLouise.ts`, `src/screens/trip/LakeLouiseCheck.tsx` |
| **M5 Body** "Sleep no higher than 3,835 m" | Already written, already carries its reason, and already goes silent with a stated cause when an input is missing. | `src/trip/schedule.ts` (`describeTonight`) |
| **M2** Do not trust `navigator.onLine` | Already solved, and correctly: the code trusts "offline" and refuses to trust "online". Measured this session: `navigator.onLine` reported **true** with the network fully dead. | `src/trip/connectivity.ts` |
| **M1** App shell saved to the phone | A service worker already saves the app: **264 files, 9.08 MB**, measured from the real build. Every future Mountain-mode screen is saved automatically with no config change. | `vite.config.ts` |
| **M1** "Add to Home Screen" prompt | **Already written and complete** — install detection, the one-tap Android install, the iPhone step-by-step. Used on exactly one marketing screen today. This is a wiring job, not a build. *(The scouting notes said this was missing. It is not.)* | `src/lib/install.ts` |
| **M7** Keep the screen awake | Already requested and wired into start, resume, finish and discard. It has three defects (section 9) but it is not a blank page. *(Also reported missing in scouting. Also not.)* | `src/tracking/useRecorder.ts` |
| **M5 Map** Distance and bearing back to camp | The great-circle maths and the compass-point naming are written and tested to half a degree. 65 of 65 tests green. | `src/tracking/follow.ts` |
| **M9** Safety layer runs before the AI | Already true on the live path: the safety check runs, and returns its fixed answer, hundreds of lines before the only network call in the file. Nothing is billed and nothing is counted. | `src/services/coach.ts`, `src/coach/safety.ts` |
| **M11** How native code slots in later | Already done once, as a worked example: a bridge contract, a detector that looks for a native shell, and an honest "not available" state in a plain browser. | `src/tracking/sources/health.ts` |
| **M6/M9** A two-reviewer sign-off process | Already exists end to end for climbing requirements — a generated sheet, two named reviewers with their certification and awarding body, a scope, and an explicit rule that "no answer" is a valid signed answer. | `src/objectives/requirements.ts`, `docs/requirements-review.md` |
| Proving the offline claim | A test that walks the real import graph on disk and fails the build if anything on the safety path can reach a network. 30 of 30 green. | `src/trip/offline.test.ts` |

### 1.2 Emergency-number coverage, mountain by mountain

| Country | Mountains | Numbers held | Gap |
|---|---|---|---|
| Nepal | Everest, Annapurna | 100, 1144, 102, 101 | — |
| Pakistan | K2, Broad Peak | 1122, 15 | — |
| **China** | **Everest (N), K2 (N), Broad Peak (N)** | **none** | **Three mountains have a border across them and we hold nothing for the northern side** |
| Tanzania | Kilimanjaro | 112, 114 | The important caveat is on the wrong row (section 5) |
| France | Mont Blanc | 112, plus the Chamonix rescue landline | France's text-message emergency line, 114, is **not** in the data |
| Italy | Gran Paradiso, Mont Blanc (S), Matterhorn (S) | 112 only | No national line behind it; the Italian mountain rescue service is named with no number |
| Switzerland | Matterhorn, Eiger | 1414 (Rega), 144, 117, 112 | **Sourced to a Zermatt tourist board** and reused on the Eiger, which is 100 km away in a different canton |
| United States | Denali | 911, plus the Talkeetna ranger station | — |
| Argentina | Aconcagua | 911, 107, 100, plus a radio frequency | "There is no phone signal on this mountain" is on the wrong row |
| Greece | Mount Olympus | 112 only | Fire service and mountain rescue named with no number |
| Slovenia | Triglav | 112 | Sourced to the Slovenian mountain rescue service itself — the strongest attribution in the file |
| Morocco | Toubkal | 177, 150, 190 | — |

**Off those fourteen mountains, coverage is nil.** All 252 treks return nothing, because the data is filed by mountain and there is no country key. That is the single most important gap in the emergency layer and it is one field wide.

### 1.3 Genuinely missing

- **Any proper on-device database.** Confirmed at runtime: there is none. Everything is in the 5 MB browser bucket.
- **Anywhere to put a downloaded map, a journal photo, or a permit PDF.** The app's own code says so: *"ICEFALL has no document storage. There is no bucket, no server table and no IndexedDB store for files anywhere in this app."*
- **A turnaround time.** Nothing anywhere in the app holds one. Twenty matches for the word "turnaround" in the code; every one is prose or a placeholder.
- **Any sunrise or sunset calculation.** Today they arrive over the internet, so daylight remaining does not exist without a signal.
- **Emergency contacts, insurance, policy number.** Nothing. The only trace is a tick-box on a kit list.
- **A sync queue.** Four half-outboxes exist and each one's own comment explains why it is deliberately *not* a queue.
- **A breadcrumb track.** The only GPS history is the saved activity, thinned to 900 points — about one every 48 seconds on a summit day.
- **Hazard zones, and route lines for the fourteen mountains.** Not a platform limit — the data does not exist. The app's own code argues against inventing it: *"A convincing satellite image with pins in plausible places is the most persuasive lie this app could tell."*

---

## 2. Architecture

### 2.1 The three decisions everything else follows from

**A. Mountain mode sits outside the main app shell.**
Every screen with a tab bar currently waits for the login server to answer before it draws anything, and that wait has no time limit. With a dead-but-present network — aeroplane wifi, a tea-house router, a captive portal — it can wait forever. **This already affects the symptom check**: `/trip` and `/trip/check` are declared inside that shell today, so the one screen whose entire point is needing no network sits behind a gate that can hang. Mountain mode is declared alongside the live-tracker screens, which already sit outside it.

**B. Small, instant things stay in the browser bucket. Everything big or binary goes to the new database.**
The new database is asynchronous — you have to wait for it. The SOS coordinates, the turnaround time and the "which screen do we open" decision must draw on the first frame with no wait, because a spinner in front of somebody's own coordinates is the failure this whole mode exists to prevent. So those stay where they are. Photos, documents, breadcrumbs, the map pack and the activity history move.

**C. The "can we actually reach anything" check lives away from the safety screens.**
The brief asks for a small test request to confirm connectivity. The existing code refuses to make one and gives its reasons: *"A hung request is a spinner between somebody and the word 'descend'."* Both are right about different things. The test request belongs to the syncing layer. The safety screens keep reading the existing honest two-state signal and never wait for anything.

### 2.2 Opening the app with no signal — **CORRECTED**

The first version of this design opened Mountain mode when the phone said it was offline. **The red team killed that, correctly.** The phone reports "online" in exactly the conditions Mountain mode exists for — one bar with no data, a tea-house router with a dead uplink, a captive portal. Measured this session: the browser said "online" with the network completely blocked.

**The corrected rule: a trip running today is the signal, not the network.**

| Condition | Where the app opens |
|---|---|
| A trip is running **today**, or a recording is unfinished | Mountain mode, straight to the Now screen — **whatever the network says** |
| No trip, and the phone says there is no network | Mountain mode's "No signal — nothing is running" screen |
| Anything else | Exactly today's behaviour, byte for byte |

This also matches the brief more literally than the first version did ("Now screen if a trip or plan is active").

"Running today" needs its own small helper, because the app's current "is there an active trip" answer is a flag with no date check — it happily reports a trip that ended in June. One screen already corrects for this by hand; another does not and prints "Trip · day 92". Mountain mode uses one helper everywhere.

Losing signal mid-session never yanks the screen. A banner offers the switch. **CORRECTED:** dismissing it means *not now*, never *not again* — it re-offers on the next screen change, on the next time the app comes to the front, and unconditionally when the turnaround time is within an hour. When a trip is running today and there is genuinely no signal, it stops being a dismissible banner and becomes a permanent row.

Regaining signal never exits the mode. It syncs and the pill says so.

### 2.3 The app-update problem — a new finding

This one is not in the brief and it is serious.

The app currently installs updates **immediately and takes over the page that is already open**. That is fine at a desk. At 4,000 m it means: a deploy lands, the new version installs, the old files are deleted, and the screen the athlete is looking at now holds references to files that no longer exist. The next tab they touch shows a blank error. It could be the SOS screen.

**The fix, four parts:**
1. Updates **wait** instead of taking over. Everyone not on a mountain still gets them instantly — the app installs held updates the moment no trip is running.
2. **CORRECTED:** the hold is gated on "a trip running **today**", not the flag that is never false, and capped at fourteen days — a fortnight-stale app is a worse risk than a warned reload.
3. A flat row on the Trip tab: *"A new version of ICEFALL is ready. It will install when this trip ends."* with an explicit **Install now**.
4. The SOS screen is built into the main file rather than loaded on demand, so it cannot fail this way from any cause.

If a screen does fail to load, an error boundary catches it. **CORRECTED:** it does not try a reload when there is no signal — a reload cannot fetch a file that is missing from both the phone and the internet, and it costs a full restart, the GPS lock and battery. Offline it goes straight to a plain sentence and keeps the athlete where they were.

### 2.4 Storage layout

**Stays in the browser bucket (small, must draw instantly):** the trip record, settings, theme, the athlete's emergency info, the turnaround times, and the last known GPS position (about 120 bytes). Plus a small bounded crash-recovery record — see below.

**Moves to the new on-device database:** recorded activities, the in-progress recording, breadcrumbs, check-ins, drink/eat logs, the journal, journal photos (stored as real files, never as text — text costs a third more), documents, the downloaded map pack, and the sync queue.

**Decision taken, so it does not block eight other things: we hand-write the database wrapper (about 90 lines) rather than adopt a library.** The obvious library is on the machine already but only by accident, as a hidden dependency of something else — importing it would work today and break silently later.

**Why crash safety needs both.** Today the app saves the in-progress recording to the browser bucket every three seconds, writing out the entire track each time. At about hour five it hits the limit and every write from then on fails — silently. Worse, the frozen copy still looks valid, so an app killed at hour eight restores hour four's track and presents it as current. That is "showing old data as current" caused by the crash-recovery mechanism itself. The fix: a small bounded summary keeps going to the browser bucket (it is the only thing that can be written reliably when a phone closes an app), and the full track goes to the database in batches.

### 2.5 Persistent storage, and the iPhone clock nobody knows about

iPhones clear a website's saved data after about a week of not opening it — **including the saved copy of the app itself**. Apple's own engineering blog says so. Home-screen apps are exempt and have their own counter.

So **"Add ICEFALL to your Home Screen before your trip" is a safety feature, not a growth prompt**, and the copy must say why.

Asking the browser to keep data permanently is also not a button that works. Safari and Chrome decide silently, with no prompt, partly on whether the app is on the home screen. So the pre-trip check reports what the browser actually said, with its reason — never a tick for having asked.

### 2.6 The sync queue, and the honest scope of it

Most of what the brief calls "sync items" **have no server to sync to**. Trips, activities, checks, debriefs, coach conversations, the journal and breadcrumbs all live on the phone and nowhere else. The app's own code says it: *"a trip lives on the phone that recorded it."*

So the screen says two different things, never one total:

- Things with a destination (a coach question, a post, a profile edit, a report): **"3 things waiting to send."**
- Everything else: **"Your trip, your track and your journal are kept on this phone. Nothing is uploaded, so there is nothing waiting — and no copy if you lose the phone."**

That second sentence already exists in the app, in the right voice.

The queue itself is one queue, superseding nothing and adding nothing — the four existing half-outboxes are left alone. It retries with increasing gaps (30 seconds, 2 minutes, 8 minutes, up to 6 hours), never on a timer (a queue polling in a tent wakes the radio all night), gives up after seven days and **shows the athlete what it gave up on** rather than discarding it quietly. Duplicate protection copies a pattern that already works in the messaging code.

**The safety layer runs twice on a queued coach question** — once when it goes in, and again before it is sent. That is not belt-and-braces: a trip can outlast a release, and an update between the two can widen the safety rules. Without the second check the queue is a hole in the safety layer that only opens for people who asked with no signal.

**CORRECTED — what happens to an offline coach question.** Two sections of this design disagreed; one of them told the athlete "I'll answer when you're back online" and stored the question. That is wrong when the athlete is four days from a signal. The resolved behaviour: **every question gets an immediate on-device answer**, clearly labelled *"Answered on this phone. This is not the full coach."* Queueing is always an additional offer, never instead.

### 2.7 Reachability check

A 13-byte file on our own servers, checked with a 4-second time limit, three times over about eleven seconds. One success ends it early. Three failures mean "connected to a network, nothing reachable through it" — the state the phone's own flag cannot express, and the one that matters.

It never runs on a timer, never blocks a screen from drawing, and costs about 3 KB of data per check, which answers the "this costs money on a satellite link" objection with a number.

**CORRECTED — the signal pill.** As designed, a successful check went stale after two minutes and the pill read "Signal not checked" for most of the day, making the mockup's "Signal · synced 3 items" state almost unreachable. Fixed: the pill is tappable and says **Check**, and the stale state says something useful — *"Last reachable 14 min ago"* — rather than restating that nobody looked.

### 2.8 Routing, and one thing that must be got right

Mountain mode lives at `/mountain`, declared alongside the live-tracker screens and outside the main shell. It draws its own top bar, its own four tabs at 68 px, and its own spacing so nothing in the rest of the app moves.

**CORRECTED — where the SOS button and the turnaround alarm are mounted.** The first design drew both inside the Mountain-mode layout. But "Start activity" goes to the live tracker, which is outside that layout, and so is the SOS screen itself. So on the two screens an athlete is most likely to be looking at on a summit day, **the alarm could not fire and the SOS button was not drawn**.

Both are now mounted once, above everything, so they are present on **every screen in the entire application** — Mountain mode, the live tracker, the full app. An alarm that only fires where you happen to be standing is not an alarm. A test asserts their presence on each named route, rather than deriving it from how the router works.

### 2.9 Leaving Mountain mode

"Back down / End trip" stops the recording, drains the queue if there is a signal, and starts the debrief. Two things to know:

- **Today, ending a trip does not stop a recording.** The two pieces of code have never met — no file imports both. Mountain mode's exit is the first place they are linked, and it must be.
- **Not every trip has a debrief to start.** The debrief is keyed to a logged objective, and plenty of trips are not one. Where there is no objective, the exit goes to the activity debrief instead, and where there is neither, the row does not appear.

**CORRECTED — "Open the full app".** As designed, this walked straight into the indefinite spinner described in 2.1. Two fixes, both wanted: put a four-second limit on the login check and treat a timeout as signed-out-for-now; and offline, the row reads *"Open the full app · needs a signal"* and does not navigate.

---

## 3. Screen by screen (M4–M7)

### 3.0 Three rules that apply to every screen

**No boxes.** The mockups draw bordered cards; the house rule rejects them and the app's own code already records the ruling — *"a group is a label and air — it is not a box."* Groups are a label and space. Rows are separated by a hairline and nothing else. The mockup's three tiles become one strip divided by hairlines, not three cards. The only container treatment allowed is the 2 px left accent bar that the symptom check already ships, on exactly two things: the escalation strip and the turnaround countdown when it goes amber. A full-screen red or amber ground is not a box — it is the background telling you which screen you are on before you have read a word.

> **Note for whoever builds this:** the supplied mockups are the source for *what is on each screen and in what order*. They are not the source for *how it is drawn* — they show bordered cards, and ICEFALL does not use them.

**Glove-first sizes.** Measured on the existing symptom check: 4 of 30 controls meet the 64 px minimum, and the five most important controls — the red flags — are the smallest at 36 px. Mountain mode's scale: the countdown at 72 px, big figures at 40 px, body text at 17 px, every tappable thing at least 64 px, alert buttons at 88 px. Main actions sit in the bottom third, in thumb reach. No entrance animation at all, anywhere — which satisfies the reduced-motion rule by construction and is also right for a screen someone is reading in the cold.

**Everything downloaded shows its age, and some things go silent instead.** One component, one rule. A figure is withheld — replaced by its reason, with no number — when it can change materially in the time that has passed **and** the athlete could act on it as if it described now. Weather and position qualify. Map geometry, camps, phone numbers and a recorded track do not: their age is information, not a defect.

| Thing | Fresh | Shown with its age | Greyed and labelled | Goes silent |
|---|---|---|---|---|
| Forecast | ≤ 6 h | 6–24 h | 24–72 h | > 72 h |
| Conditions (wind, temperature) | ≤ 1 h | 1–3 h | 3–6 h | > 6 h |
| Your position | ≤ 30 s | 30 s – 5 min | 5 min – 1 h | > 1 h *(except on SOS, which always states the last known position with its full date and time)* |
| Downloaded map | ≤ 7 d | 7–30 d | > 30 d | never |
| Camps, huts | ≤ 12 months | — | > 12 months | never |
| **Costs, permit prices** — *added* | ≤ 6 months | 6–12 months | > 12 months | never |
| **Season windows** — *added* | ≤ 6 months | 6–12 months | > 12 months | never |
| **Daylight** — *added* | — | always states the position and clock it used | — | when the position is stale and there is no objective coordinate |
| Last night's recorded altitude | ≤ 36 h | — | — | > 36 h → tonight's ceiling is withheld with its reason |
| Emergency numbers | — | **its own wording, never a bare date — see section 5** | — | **never** |

Three of those rows were added after the red team found them missing. Cost sheets and season windows both carry a date in the data and were about to be drawn without one. **CORRECTED:** the ceiling is withheld by one shared function, so the Body tab and the Trip tab cannot disagree about the same number on the same phone at the same moment — as the first design allowed.

**CORRECTED — the app's own age.** Nothing in the first design ever told the athlete when the saved copy of the app was made. That matters more than any single figure, because the camps, the rescue numbers, the costs, the seasons and the phrasebook are all inside the app file — so the app's age is the age of all of them at once. One line at the top of "What's saved on this phone": *"This copy of ICEFALL was saved on 2 August. Everything below came with it."*

### 3.1 M4 — the shell

**Top bar.** "MOUNTAIN MODE" on the left. The signal pill in the middle. **A red SOS button, 64 × 64, fixed top-right, on every screen in the app.** It opens the SOS screen; it does not dial. One tap to dial means a rucksack pocket rings Nepali mountain rescue repeatedly.

**Battery.** Shown where the browser exposes it. On an iPhone it never does — Safari has never implemented it, on any version, and every browser on an iPhone is Safari underneath — so **the element is not drawn at all**. Not a dash, not a blank.

**Four tabs at 68 px:** Now · Map · Body · Trip. Mountain mode's own bar, not the app's 52 px one — widening the shared bar would move every scrolling screen in the app.

**"Open full app"** is the last row of the Trip tab, not a hidden menu. Leaving is not an emergency and does not deserve permanent chrome; hiding it behind an icon in gloves deserves a complaint.

### 3.2 Now

| What | Where the number comes from | With no signal | Missing / empty |
|---|---|---|---|
| **Day 2 · Mont Blanc** | The trip, with the date window applied | Identical | No trip: *"No trip open."* Trip not started: *"Mont Blanc · starts in 6 days"* — never a negative day number |
| **Turnaround countdown**, huge | A new field the athlete or their guide sets | Identical — wall clock only, re-checked every time the screen comes back rather than trusted to a timer | **Not set** is the default and it is visible: *"No turnaround time set."* There is no itinerary in the app to default from |
| Nearest hut or camp | Real map coordinates from OpenStreetMap | Identical | *"Straight-line, not along a path."* No camps recorded: the existing honest sentence |
| Ascent remaining | The camp's recorded height minus your GPS height | Identical | Shown only when **both** numbers exist. One missing means no number |
| Pace | The recording, or breadcrumbs | Identical | *"Not recording."* **There is no plan with times in the app, so there is no "vs plan"** — it is pace over the last hour |
| **Daylight remaining** | New: about 80 lines of the US government's published sun-position equations, public domain, on the phone | Identical — pure arithmetic | Says which position and which altitude it used, and **that it came from your phone's clock**. Withheld when the position is over an hour old |
| Altitude | GPS, **with its error bar** | Identical | `4,120 m ± 12 m · GPS`. **CORRECTED:** where the phone reports no accuracy, round to the nearest 50 m — *"≈4,100 m · GPS, this phone did not say how accurate"* — and **withhold ascent remaining entirely**, because the difference between two numbers, one of unknown error, is not a number |
| **Check how I feel** | — | — | Always there, pinned in thumb reach |

**Daylight carries two figures, not one:** sunset, and the extra usable light after it. It adjusts for how high you are — at 4,000 m the sun sets about ten minutes later than at sea level. And it says what it does not know: *"This is the sun below a flat horizon. A ridge to your west takes the light sooner — sometimes an hour sooner. ICEFALL does not know your skyline."*

A resumed recording always comes back **paused** — that is deliberate, so a crash never adds time nobody moved. Mountain mode makes that the loudest thing on the Now screen, because an offline launch that silently loses the day is exactly what the banner is for.

### 3.3 Map

| What | With no signal | Missing |
|---|---|---|
| The map | Only if a pack has been downloaded | The existing honest "map unavailable" screen — **with its border removed, in the whole app, not just here** |
| "Map saved 2 days ago" | Only once packs exist | Until then: *"ICEFALL shows the part of the map you have already looked at. It has not saved this area."* Saying "saved 2 days ago" over the current caching would be showing old data as current in the most literal way |
| Route line | Drawn if packed | **For the fourteen mountains there is no line to draw.** The app holds a name, a grade, a distance and a height gain — and no geometry at all. The map shows the summit and the camps and says why there is no line |
| **"Illustrative — not for navigation"** | Always | Printed under every line that *is* drawn, without exception |
| Camps and huts | Yes | Real coordinates, real heights, never invented |
| Hazard zone | — | **Not in the data, at all.** The nearest honest thing is pins the athlete or their guide adds, labelled *"Added by you · not verified"*, **with the date they were added** — snow conditions are the fastest-changing thing in the app |
| **Retrace my route** | Identical | See below |
| Centre on me | Identical | Needs its own position source, independent of whether a recording is running — somebody walking to a hut has not pressed Start |

**CORRECTED — Retrace.** The first design marked this as simply working. It does not. GPS stops whenever the phone is locked or in a pocket, which is most of a walk-in. So the breadcrumb line has holes exactly where the athlete was not looking at their phone, and a line drawn through those holes **cuts corners across terrain nobody walked**. On a descent in poor visibility that is a line pointing at a drop.

Three changes:
1. The map draws a **visible break** wherever breadcrumbs are further apart in time than expected. Never a joined segment.
2. The sentence: *"This is only where ICEFALL was open and watching. If your phone was in your pocket there are gaps, and this line does not go round them."*
3. **The bearing and distance come from your current fix, not from the last breadcrumb**, and are withheld outright when the current fix is stale: *"Your last position is 40 minutes old. ICEFALL cannot tell you which way camp is from where you are standing."* Then it offers the one honest thing left — the camp's own coordinates and the track on the map.

**The compass.** Three facts change this from what the brief assumes. The permission prompt is now needed on Android too, not just iPhone. The web standard does not say whether the reading is magnetic or true north, and the two platforms get there differently. ICEFALL's own bearings are true north. The difference is nothing in Nepal and about 15 degrees in Alaska. **So: a needle is drawn only when we have an absolute heading and have corrected for the local difference. Otherwise the screen shows a bearing in text with a compass point** and says *"Your phone's compass is not available — this is a bearing from the map, not a heading."* A needle pointed 15 degrees wrong on Denali is worse than no needle.

The map does not rotate with heading. The app already decided this and wrote down why: at walking speed the heading a phone reports is derived from drift, so turning the world with it is turning it at random.

### 3.4 Body

| What | With no signal | Missing |
|---|---|---|
| **Tonight's ceiling** — "Sleep no higher than 3,835 m" | Identical | Four real silent states, each with its reason, carried word for word. Never a blank tile |
| **Quick check-in** — Feeling good / Some symptoms / Unwell | Identical | *"Nothing logged today"* |
| **The persistent safety line** | Identical | See below |
| Symptom check | Identical | Always available, never behind a subscription. The app's own code: *"an app that put that behind €9.99 would be selling the one thing it must give away"* |
| Drink · last logged | Identical | *"Nothing logged yet"* — never a made-up interval |
| Eat · last logged | Identical | Same |

**CORRECTED — "Unwell" and the persistent line.** The first design sent "Unwell" into ten questions before any advice, and demoted the brief's standing sentence from advice to a link. Both were wrong for someone who is confused at 4,000 m. Fixed:

- **"Unwell" shows the altitude-sickness advice immediately**, in the app's existing words, with *"Answer a few questions"* as the second option. Because it is the existing text, there is still exactly one voice.
- **The persistent line carries advice and a link:** *"Headache, nausea or confusion? Stop going up, tell whoever you are with, and go down if it does not clear. → Open the self-check."* The sentence is exported from the same file that owns every other altitude message, so it cannot drift.

**The symptom check, glove-sized.** One question per screen, ten steps. Same engine, same scoring, same escalation firing before you finish. The controls become 88 px. **A third option is added to the red flags — "Not sure" — because the current screen's own comment says "not answered is a real state" while the control only offers two, so a mis-tap in gloves is permanent.** The existing screen gains the same third option in the same change, so the two cannot disagree.

### 3.5 Trip

Flat rows: itinerary · documents · gear list · contacts · phrasebook · journal · screen brightness · open the full app.

- **Documents** (permits, hut bookings, insurance) live on the phone only. *"This is the only copy. Keep a paper copy and a photo in your phone's own photo library."* **CORRECTED:** iPhones can clear this after about a week of not opening the app, so their presence is checked on **every** launch, not only in the pre-trip check — *"Documents · 3 saved"* or *"Documents · nothing saved on this phone."*
- **Gear list** gains tick-marks, which it does not have today — the app currently links to a list that forgets everything the moment you navigate away. The full-app screen gains them too, or the two disagree.
- **Phrasebook** ships inside the app, marked *"Draft — needs native-speaker review."*
- **Journal** stamps each entry with time, height (with its error bar) and position. **CORRECTED — a warning nobody expected:** on an iPhone, taking a photo from a web page leaves the app for a moment, which releases the screen lock, pauses GPS, gaps the breadcrumbs and can lose the turnaround alarm entirely. So the photo button warns first: *"Taking a photo leaves ICEFALL for a moment. Your recording and your turnaround alarm pause until you come back."* And coming back re-arms everything in one go and reports the gap on screen.
- **Bright/Dark** — see section 6.

### 3.6 SOS — one screen, one spec

Two versions of this screen were drafted, in different orders. **That is now settled: section 5 owns the SOS layout and section 3 defers to it.** The order matters more than anything else on the screen, because it decides what somebody sees in the first second.

Top to bottom: **your coordinates first** (they work with no phone number at all, and they are what you read aloud), Copy, **"Write these down"**, what to say, any warning about signal on this mountain, **then the call button in the bottom third** for thumb reach, then the other numbers, the SMS row, your emergency info, and the source and date at the bottom.

**CORRECTED — "Write these down".** Nothing in the first design got the coordinates off the phone before the phone died. At 6% with the screen on and GPS hunting, that may be twenty minutes. A row above the fold shows the coordinates in a form that copies to paper — including degrees and decimal minutes, which is what most rescue services read back — and prompts automatically below 15% battery where the battery level is available. It costs nothing and it is the only part of the SOS screen that survives a flat battery.

**CORRECTED — the call is three taps on an iPhone, not two.** Tapping a phone-number link raises a system confirmation whose buttons are sized by the phone, not by us, and it takes over the screen so the coordinates are no longer visible during the call. Both are said in the copy, and the script line reads *"Read your position out before you dial — you will not see it during the call."*

### 3.7 M7 — the turnaround alarm

**Where it is mounted: above everything, so it fires on every screen in the app** including the live tracker and the SOS screen (corrected — see 2.8).

| State | On screen |
|---|---|
| Not set | *"No turnaround time set"* and a button. Never an invented time |
| Set | The date and time, quietly |
| Counting down | Huge numbers; amber accent under 30 minutes |
| **Due** | Full-screen amber. *"Time to turn around."* Time left to the summit at current pace (only if both a target and a live pace exist — otherwise the line is absent, not zero), daylight left, and *"Your guide's call comes first."* Two 88 px buttons: **Turning around** and **Snooze 15 min** |
| Snoozed | Counts down again. **CORRECTED:** after three snoozes it stops interrupting but **does not go quiet** — a permanent amber line at the top of every screen counts *up*: *"You passed your turnaround time at 13:00 — 1 h 12 min ago"* |
| Missed | Full screen: *"This alarm did not sound. ICEFALL was closed. You set it for 13:00. It is now 14:20."* |

**What fires it:** the wall clock, re-checked every single time the screen comes back, gains focus or is reopened. The ticking display drives the digits; it never decides. Phones freeze timers when an app is in the background, so a timer-driven countdown is wrong by however long the phone was away.

**What it will and will not do — this is the most important honesty in the whole plan.**

> **This alarm only sounds while ICEFALL is open on the screen.** If you lock your phone or switch to another app, it will not sound. If your phone is in low-power mode the screen may darken anyway. **On an iPhone this alarm cannot vibrate, and it will make no sound if your ringer switch is off** — it is a screen you have to be looking at. **Set an alarm on your watch or your phone's own clock as well.** The ICEFALL app for iPhone and Android will fix this; this one cannot.

The iPhone sentences are **CORRECTED** additions. Safari has never supported vibration on any iPhone, and the app's own code already records this. The hardware ringer switch silences web-page audio. On the platform the owner actually targets, an unmodified version of this alarm would be a colour change on a screen in a chest pocket.

**CORRECTED — the alarm is described as a backup, not the primary.** The arming screen's first instruction is now *"Set this on your watch or your phone's own clock. ICEFALL will also show it, but only while the app is open."* That is a demotion, and it is the honest one — see the battery arithmetic in section 9.

---

## 4. Offline maps — recommendation and licensing

### 4.1 The conclusion first

> **A downloaded map means rendering our own map tiles from OpenStreetMap data and hosting them ourselves. There is no free tile service we are permitted to download an area from. The only alternatives are to pay a provider whose licence allows offline packs, or to ship no downloaded map and say so plainly.**

That is not one option among four. Every source was checked and every one either forbids the download by name, requires written permission, asks you not to, or forbids offline use outright.

### 4.2 Every source, quoted

| Source | Used for today | May we download an area? | The words |
|---|---|---|---|
| **OpenFreeMap** (our main map) | The house map style, paths, huts, peak labels | **Not without written permission** | Terms of service, User Conduct: *"You will not: … Attempt to collect data from the service in automated ways without permission."* No volume threshold is stated anywhere, so there is nothing to design to — only permission or not. Also: *"We aim to maintain the Site's availability but may discontinue it at any time without notice"* and it is supplied *"AS-IS, AS-AVAILABLE, WITH ALL FAULTS"* |
| **AWS Terrain Tiles** (the 3D relief) | Hillshade and terrain | **Yes — open data, no caching restriction** | Public dataset, no signing required. Attribution is per-source, and we currently credit only "Mapzen / AWS" |
| **Mapbox** (the mountain page's 3D satellite view) | One beautiful view | **The cache: yes. The download: no.** | Product Terms §2.8.1: *"Customer may cache that Licensed Map Content on an End User's device but caching is limited to thirty (30) days."* §1.9: *"(ii) not perform bulk or automated queries, (iii) not scrape or systematically download Licensed Map Content."* So the brief's rule 4 is right in outcome and wrong in reason: caching is allowed and Mapbox's own code is already doing it (measured: 500 tiles, 33 MB on this machine). **What is forbidden is the pre-emptive download that would fill it** |
| **OpenStreetMap's own tile server** | Small map thumbnails, four screens | **Forbidden by name** | Tile usage policy §4: *"Offline use is not permitted on tile.openstreetmap.org. Features such as 'Download city/country for offline use' or 'Save area for later' … are therefore prohibited."* §2 also requires attribution shown clearly on the map — **which we are not doing today. See section 9** |
| **Esri satellite imagery** | The "Satellite" style, four screens | **No, and it is also non-commercial only** | Esri's own item says it *"is not intended to be used to export tiles for offline"*, and the free keyless tier is granted for use that does not *"generate income or promote the generation of income"* |
| **OpenTopoMap** | The paper-map style | **Licence would allow it; the operators ask you not to** | Their FAQ welcomes embedding *"provided our server is not overburdened by e.g. mass downloads"* and adds that *"no availability can be guaranteed."* They have also announced they are retiring their render machine |
| **A pre-rendered picture of a map** (the brief's option b) | — | **Illegal from every provider we touch** | Mapbox forbids it by name: *"…or by using a screenshot or other static image instead of accessing Licensed Map Content directly from the Mapping APIs."* Esri transfers no redistribution right. OSM's policy forbids the bulk fetch that would build one |
| **MapTiler** (considered, not used) | — | Their pricing lists no offline/download tier | Free, $30/month, or custom prepaid. A new paid service either way |

### 4.3 The recommendation

**Build our own map packs and serve them from our own site.** Take OpenStreetMap data from a source that publishes it for exactly this purpose (Protomaps' daily builds, OpenFreeMap's own published weekly planet files, or a regional extract processed ourselves), cut out the area around each objective, and ship it as a single file. Terrain comes from the AWS elevation data, which has no caching restriction. The map component we already use can read it with one small library.

Nobody's tile server is touched. Nobody's goodwill is load-bearing. The brief's rule 4 is satisfied absolutely rather than argued about. And **the same pack works identically inside a native app later**, so nothing is thrown away.

**What we give up:** no satellite photography offline, and no Mapbox 3D offline. The pack is map cartography plus terrain shading.

### 4.4 Four corrections to this recommendation

**CORRECTED — no third-party tile download ships in version one, in any form.** One section of this design specified writing trip tiles into our own cache, described as being outside the normal system. That is still the same requests to the same servers — moving where the answer is stored changes nothing about OpenFreeMap's terms. **One ruling, binding everywhere: the only bytes a download may contain are from our own site or from the AWS elevation data.** The tile-by-tile option is deleted from the plan rather than left as an alternative, because it is the option that breaches.

**CORRECTED — the terrain attribution is incomplete, and it was measured.** The plan said we owe two credits. There are three. Checking every one of the fourteen mountains: Everest, K2, Kilimanjaro, Aconcagua and Toubkal come from SRTM; Mont Blanc and the Matterhorn come from the European Copernicus data; and **Denali comes from the US Geological Survey's National Elevation Dataset, because SRTM's coverage stops at 60° north and Denali is at 63°.** Shipping an Alaska pack crediting SRTM credits the wrong agency. The fix is not to hand-write the credits: the source is machine-readable on every tile, so the pack builder reads it, collects the credits, and the map shows the credits its own pack declares.

**CORRECTED — the share-alike question, and a one-line mitigation.** OpenStreetMap-derived data is licensed under a share-alike licence. Protomaps characterises its output as a "Produced Work", which carries a lighter obligation — but that is their characterisation of their own output, and a vector map file carries geometry and attributes, which is materially closer to a database than a picture. If it counts as a database, anyone who receives the app can require the data. **Near-total mitigation for one line of copy:** the packs will be public static files on our own site anyway, so publish them at stable URLs and say where they are in the map's credit line. That satisfies the obligation whichever way the classification falls.

**CORRECTED — the pipeline costs more than "our own hosting, no new provider".** The full planet file is around 120 GB and its publisher discourages linking directly to it. Use regional extracts instead (100 MB – 1 GB per rebuild, free), run it as an offline script whose output is uploaded — never as part of the normal build. See section 10 for the honest size.

**One thing not verified, and it should be proved on a throwaway page before anything is committed:** that our map component can drive terrain shading out of a local pack file. The map side is routine; the terrain side is an assumption.

### 4.5 A cost decision that must be written down

Mountain mode's map uses the free map component, not Mapbox. Mapbox is already a live billable service in this app — 50,000 free map loads a month, then $5.00 per thousand. **Mountain mode adds no cost, but only by coincidence.** The first person who wants a better-looking Map tab will reach for the Mapbox component and start billing on every tab switch. So it goes in the plan and in a comment on the screen: *"This map is deliberately not Mapbox. Mapbox bills per map opening; a tab somebody switches to forty times a day is not the place for it."*

### 4.6 The interim, if the pipeline is deferred

The Map tab ships with the existing honest screen: *"ICEFALL shows the part of the map you have already looked at. It has not saved this area."* Not a half-true "Map saved 2 days ago" over a cache that ordinary browsing can empty.

---

## 5. The emergency-number dataset

### 5.1 The structure

Numbers move **up to the country**, where they belong, and the mountain record keeps only its own lines (the Chamonix rescue landline, the Talkeetna ranger station, Aconcagua's radio frequency). After that there is exactly one Italian 112 in the entire codebase, and every screen reads it. Today there are several, and they can drift.

Each number gains one new field: **what kind of contact it is** — a dialable number, a radio frequency, or a text-message line. This matters because the data legitimately contains `"VHF 142.800"` and `"+33 4 50 53 16 89"`, and any code that builds a phone link out of every entry produces a **dead tap** and two broken links. There are no phone links in the app today, so there is no existing code to catch out — only future code, and this field must land in the same change as the first one.

A country the app deliberately holds nothing for is recorded as such, with the reason, rather than being a silent hole. **China is the first entry**, covering the northern sides of Everest, K2 and Broad Peak, where access runs through a permitted operator and the number that reaches anyone is the operator's.

### 5.2 Two dates, not one

Every number in the file currently says it was checked on 11 September 2026 — because that is the day the file was written. That is honest about **the source page** and silent about **the number**.

- **Read on** — the day we read the government page. Exists today.
- **Confirmed on** — the day a human who works in that country said these are the numbers people actually use. New.

The screen shows **the older of the two**, because the reader's question is "how old is the freshest confirmation anyone made", and the honest answer is the weakest link.

**CORRECTED — the wording.** One section of this design specified a generic age line reading *"Checked 11 September 2026"*. That implies somebody verified it. **There is no generic age line for emergency numbers.** There is one function that produces the whole sentence for each state — for an unconfirmed record it reads *"Read off a government page on 11 September 2026. Nobody who works in this country has confirmed it since."* Never a bare date.

### 5.3 Review

Copied in shape from the guide sign-off that already works: two named reviewers, each with their role and the organisation they hold it with, a date, and a **scope** — *"Nepal, Khumbu, spring trekking season"* is a scope; *"Nepal"* is not. **An empty sheet is a valid signed answer.** A guide saying "there is no number here that works" is real information, and it gets shown in their words.

Four states, and what each does on the screen:

| State | What happens |
|---|---|
| No record for this country | The 112 fallback, with its full note |
| Record exists, nobody local has confirmed it | **The numbers are still shown at full contrast and still dialable.** Underneath, the honest sentence. 112 stays visible below as a secondary row |
| Reviewed, and they gave us no number | 112, **with the reviewers' own reason above it** |
| Reviewed and populated | *"Confirmed 4 March 2027 by [names]. Scope: Nepal, Khumbu, spring season."* |

**This differs from how the app treats unreviewed climbing requirements, on purpose.** An unreviewed fitness threshold is withheld, because showing it would be the app asserting somebody is ready. An unreviewed emergency number is **shown**, because leaving somebody with nothing at the bad moment is worse by a wide margin. Review changes how loudly the app vouches for a number, never whether the number is there.

### 5.4 Staleness — a deliberate exception to the brief

The brief says stale safety data is greyed and, where it matters, silence beats an old number.

**For a phone number, that is wrong, and this is the one place in Mountain mode where rule 2's usual presentation is deliberately not followed.** A greyed or disabled dialling button is worse than a two-year-old number that is very probably still correct. So: **the digits and the call button never grey and never disable. The age line carries the staleness, loudly.**

**CORRECTED — and we do not reorder on age.** The first design promoted 112 above the national numbers past two years. That would steer somebody in Nepal towards a generic routing convention over 1144, which we read off a government page and which is almost certainly still right. National numbers stay first at any age, with the age line loud, and 112 stays where it is — a labelled last resort.

### 5.5 The 112 fallback, word for word

The strongest claim the European Commission's own page makes is that 112 is *"available everywhere in the EU, free of charge"* and *"available worldwide on GSM mobile networks."* That second sentence is about **handsets and networks mapping the digits**. It is not a promise that a service exists, answers, understands you, or comes.

> **ICEFALL holds no emergency number for this country.**
>
> 112 is the emergency number across the European Union. Outside it, most mobile phones recognise 112 and try to route it to whatever local service exists — that is a convention built into handsets and networks, not a promise about what is at the other end.
>
> It may not be answered here. It may not reach mountain rescue. Whoever answers may not speak English. And none of it works without a signal.
>
> Ask your guide or your operator for the local number, and ask before you are on the mountain.

### 5.6 How the screen finds the right numbers — **CORRECTED**

The chain from a trip to a number is broken today. The trip record carries a mountain **name** and an optional link to an objective; it does not carry a mountain identifier, and the function that creates a trip takes six fields, none of which is one. So **every trip started from a custom objective falls through to 112**, and so does every one of the 252 treks.

**This is not a later phase. It is the minimum for shipping SOS.** The trip record gains a mountain identifier and a country code, copied when the trip is created — for exactly the reason it already copies the mountain's height: *"the schedule an athlete reads on the mountain must not change under them."* It is a one-file change.

Order of resolution: the trip's mountain → the destination country the athlete set → 112 with the note. **The app never guesses the country from your position** — there is no country-boundary data in the app, and a position forty kilometres from Mont Blanc could be in France, Italy or Switzerland. Three services, three bills, one wrong number on the biggest button on the screen.

Until the country layer exists, **the SOS screen says which mountain it thinks you are on**, so a wrong match is visible rather than silent.

### 5.7 The athlete's own emergency info

New, device-only: name, destination country, up to three contacts with numbers, insurer, policy reference, rescue hotline, and a free-text note about what the cover includes.

**Deliberately not held: blood group, allergies, conditions, medication.** Those are special-category health data whose consent wording the app serves from its database and shows word for word — and that wording cannot be fetched with no signal, so a Mountain-mode screen cannot honestly take that consent. The brief did not ask for it either. On screen: *"ICEFALL does not hold anything about your health. Allergies, medication and blood group belong on a card in your jacket, where somebody can read them without your phone."*

**It never syncs, and there is nothing to sync it to.** A "back these up" toggle would be a control that does nothing. Deletion is offered three ways, all real, and one of them is wired with a test asserting the button exists — because the app already contains one deletion function with no button behind it.

### 5.8 The text-message row

Two syntaxes, and the one that works on an iPhone is not sanctioned by Apple. The standard form works on Android. Apple's own developer reference says of text-message links, word for word: *"The URL string must not include any message text or other information."* The form that works on iPhones is undocumented and could be removed.

**So the text-message row is never the only route by which coordinates reach anybody.** The on-screen coordinates and Copy are primary. And the row addresses **the athlete's own emergency contact**, not 112 — texting an emergency number works only in countries with a scheme, usually only for people pre-registered on it, and France's 114 (which is such a line) **is not in our data today**, despite an earlier note saying it was.

The sentence beside it: *"This opens your messaging app with the message ready. ICEFALL cannot send it, cannot send it later when a signal comes back, and cannot tell you whether it arrived. A text sometimes gets through where data does not — but if you close this without sending, nothing was sent."*

### 5.9 Data fixes this work must carry

| Fix | Why it cannot wait |
|---|---|
| Re-source the Swiss numbers to a national or Rega page | A Valais tourist board is currently cited for national numbers, on a mountain 100 km away in a different canton. The file's own rule forbids carrying anything across from a neighbouring mountain |
| Move Tanzania's "these numbers do not consistently work outside Dar es Salaam" onto the record, not one row | It is currently on the *second* number. The *first* becomes the big call button |
| Move Aconcagua's "there is no phone signal on the mountain" onto the record | Promoted to a call button, 911 would be a dial control on a mountain the record itself says has no signal |
| Mark the radio frequency as a radio | So no code path can build a phone link out of it |
| Strip spaces from the two international numbers | The link form is currently malformed |

### 5.10 The review sheet

Generated from the data, not written — the same machinery as the existing guide sheet, so the sheet cannot quietly disagree with what the app shows. One section per country: what we currently show, a table for corrections, the questions a web page cannot answer (*"which of these is actually answered in the mountains, as opposed to in the capital?"*, *"what language is answered in?"*), and the sign-off block.

**One instruction in bold at the top of every sheet: nobody rings an emergency number to test it.** A reviewer confirms from knowledge and from the pages named, never by dialling.

---

## 6. Web versus native

Four verdicts, and each carries an obligation. **CORRECTED:** the first draft mixed "the browser cannot do this" with "we have not built it yet", which let bugs hide behind platform excuses. There is now a fourth verdict for the second case.

| Verdict | Means | Obligation |
|---|---|---|
| **Works** | Does what the athlete expects, everywhere | Nothing extra |
| **Works with limits** | Runs, but not the way they would assume | The exact sentence, shown where the feature is used — not in a help page |
| **Works once fixed** | The browser can do it; our code does not yet | Named file and line in the bug list |
| **Native only** | Impossible in a browser | Not a greyed control — a dead tap is a bug. One line of prose, or nothing |

### 6.1 The table

| Feature | Verdict | The limit | What the athlete is told |
|---|---|---|---|
| App works offline | Works with limits | Only after the app has been opened **once** with a signal. The very first launch with no signal shows the browser's error page and nothing we write can change that | *"ICEFALL saves itself to your phone the first time you open it with a signal. Open it once at home before you go."* |
| The display typefaces | Works once fixed | Zero font files are currently saved with the app; they come from Google's servers. Mountain mode is built on huge numerals | Nothing — self-host the two files instead. Never ship a sentence apologising for a font |
| On-device database | **Works with limits** *(corrected)* | The first draft said "no limits". The same table then quoted Apple deleting all of a website's saved data — including this database — after about a week of not opening it | Shares the Home Screen sentence, and it appears **at the point of saving a document**, not in a settings page |
| Persistent storage | Works with limits | Not a button. Safari and Chrome decide silently on their own heuristics, largely on whether the app is on the home screen | Refused: *"Your phone decided this for itself and said no. It does not ask you. Adding ICEFALL to your Home Screen makes it far more likely to say yes."* |
| Storage used / free | Works with limits | It is an estimate, padded on purpose | *"About 41 MB saved. Your phone reports roughly 10 GB free — that is an estimate, not a promise."* |
| Sync queue | Works with limits | Only drains while the app is open. The background version does not exist in Safari on any version | *"Waiting to send. ICEFALL sends these next time you open it with a signal."* |
| Trusting "no network" | Works | The phone's "offline" is reliable; its "online" is not | The existing wording |
| Reachability check | Works with limits | Architectural, not platform: it must stay off the safety path | — |
| **Battery percentage** | **Native only on iPhone; works on Android** | Safari has never implemented it, on any version. Every browser on an iPhone is Safari underneath | **Nothing** — the element is not drawn |
| Turnaround countdown | Works with limits | Must be re-read from the clock every time the screen comes back; phones freeze timers in the background | — |
| **Alarm with the screen locked** | **Native only** | There is no web way to schedule a future notification. The one proposal that would have done it is dead — Google's own documentation says its development *"has ended."* The only alternative is a server push, which needs a signal, breaking rule 1 outright | The full sentence in §3.7 |
| Keep the screen awake | Works once fixed | Supported everywhere we care about, including iPhone since 16.4. But it is released the moment the app goes to the background and **our code never asks for it again** — measured live. It can also be refused outright in low-power mode | Granted: *"Screen kept on. This uses more battery — and a lit screen in the cold flattens a phone fast. A flat phone has no SOS."* |
| GPS altitude with its error | Works | The error figure is **already collected on every fix and read by nothing** | `4,120 m ± 12 m · GPS` |
| Daylight on the phone | Works with limits | Flat horizon; and it depends on the phone's clock | Both stated on the tile |
| Compass | Works with limits | Permission prompt now needed on Android too; magnetic vs true is undefined by the standard | Two separate readings, never one needle |
| **Retrace line** | **Works with limits** *(corrected)* | Gaps wherever the phone was in a pocket | *"This is only where ICEFALL was open and watching…"* and visible breaks in the line |
| **Call button** | **Works with limits** *(corrected)* | Needs the dialable/radio distinction to exist first, or it produces dead taps. And it does nothing on a device with no mobile radio | *"If this phone has no mobile signal the call will not connect. The number is written out above so it can be dialled from another phone or a radio."* |
| Coordinates, both formats | Works | — | — |
| Copy | Works with limits | Needs a secure connection | On failure: *"Couldn't copy. Press and hold the coordinates to select them."* |
| Text message with your location | Works with limits | Two syntaxes, one undocumented; and a web app cannot send or queue one | §5.8 |
| SOS in aeroplane mode | Works with limits | GPS itself works — it only receives. What aeroplane mode removes is the assistance that makes the first fix quick. **CORRECTED: no duration is printed**, because we have not measured one. The screen shows the elapsed seconds, which is measured, and keeps the last known position visible underneath | *"Finding satellites. This can take a long time with no signal, and it can fail under a face or in a valley."* |
| Background GPS | **Native only** | iPhones suspend a backgrounded web page; Android freezes it | *"GPS stops when you lock the phone or leave ICEFALL. Your track picks up again when you come back, with a gap in between."* |
| Barometer / storm warning | **Native only** | No web API exists, and there is no barometer in this app — despite a flag in the code that claims one | In Trip → About: *"ICEFALL has no pressure reading. The altitude here comes from GPS"* |
| Large offline maps | **Not fixed by a native wrapper** | A wrapper is still a browser running the same map code. Mapbox's offline tools belong to their separate mobile libraries. Our own pack works identically on both | — |
| The watch | **Native only, and not a wrapper feature** | A wrist app is a separate Swift or Kotlin project with its own submission. And `src/watch/` in this codebase is **not** a watch app — it is a cloud import of finished activities from Garmin, COROS and others | — |
| GPS battery saver | Works with limits | See §6.2 | — |
| Bright-snow theme | Works once fixed | A full light theme already exists but is a warm off-white for indoor reading. This is a third set of colour values, not a new system | — |

### 6.2 Battery saver — two corrections

**CORRECTED — it must never apply when there is no signal, or on the SOS screen.** Turning off high accuracy gives the phone permission to skip the GPS chip entirely and fall back to positioning from wifi and mobile masts. At 4,000 m there are none. So on the one screen where a position is the only thing that can find somebody, the battery setting could remove it. **High accuracy is forced on whenever the phone reports no network and always on the SOS screen, regardless of the setting.** The settings row says so: *"Battery saver never applies when you have no signal — without a signal, GPS is the only thing that can find you."*

**The brief asks for "lower GPS sampling", and there is no such control.** The web standard offers exactly three settings, none of which is a rate, and throttling in software saves nothing because the receiver is already running. The only real levers are turning off high accuracy (which costs metres of position and usually the altitude first), accepting a slightly older fix, and switching the GPS off entirely while standing still.

### 6.3 What a native wrapper actually buys

| Capability | What it fixes |
|---|---|
| **Locally scheduled notifications** | **The alarm with the screen locked — completely, with no server, working in aeroplane mode.** This is the single strongest reason to wrap |
| Background GPS | Recording that survives a pocket |
| Battery level | The one thing an iPhone will never give a web page |
| Compass | A true-north heading, standing still |
| Barometer | A real storm warning from a pressure trend |
| Storage | No week-long clock, no eviction heuristics |

**CORRECTED — the price.** A wrapper costs an **Apple Developer Program membership at $99 a year and a Google Play developer account at $25 one-off**, plus app review and a justification Apple will ask for regarding background location. The first draft argued this on architecture alone and never mentioned the money. The owner should decide knowing that the strongest safety feature in the brief costs about $99 a year plus review.

### 6.4 How the code is arranged so native slots in later

One small folder holds the contract: every platform-dependent thing behind one shape, **and every answer carries the sentence the athlete is shown**, so an absent capability cannot reach a screen as silence. The web implementations live in one file each. When a wrapper is commissioned, native implementations land as new files alongside, and one line switches them on. No screen changes.

This is not a new idea in this codebase — there is already a finished worked example of exactly this pattern for health data, naming the exact plugins and the exact phone permissions needed.

**What the wrist app needs from us now, at no cost:** keep the four things a watch would show — the countdown, the next point, daylight, the bearing home — as **plain functions of stored data**, not calculations buried inside a screen. Then the wrist app calls the same arithmetic and the two cannot disagree. If they are computed inside a screen, they will be rewritten and they will drift.

---

## 7. Storage budget

### 7.1 Once per install

| | Size |
|---|---|
| The app itself, as saved today | **9.08 MB** (264 files, measured) |
| — of which the world peaks list | 4.63 MB |
| The 3D map component, not yet in this build | +1.55 MB |
| Self-hosted typefaces | +0.12 MB |
| **Total after Mountain mode** | **≈ 10.8 MB** |

### 7.2 Per downloaded trip

| | Size | Downloaded? |
|---|---|---|
| Mountain facts, camps, costs, seasons, **emergency numbers**, phrasebook | **0** | No — all inside the app file already. 217 KB of source, riding along free |
| **Hazards** | **0** | **Nothing to download — they are not in the data** |
| Itinerary, emergency info, turnaround times | < 5 KB | No — typed by the athlete |
| Route line for a **trek** | ~833 KB | Yes |
| Route line for one of the **fourteen mountains** | **0** | **Nothing to download — no geometry exists** |
| Forecast | 9 KB (measured) | Yes |
| **Map pack — summit day** (Mont Blanc) | **3.7 MB** | Yes |
| **Map pack — full trek** (Everest Base Camp) | **8.3 MB** | Yes |

| Scenario | Download |
|---|---|
| One of the fourteen mountains, no map pack | **~15 KB** — the honest sentence is "nothing to download", not a progress bar |
| Summit day with a map pack | **~3.8 MB** |
| Full trek with route and map | **~9.2 MB** |

### 7.3 Grows during the trip

| | Per day |
|---|---|
| Breadcrumbs (one point every 25 m) | **~20–25 KB** for a 20 km day |
| *the same at one point per second, for contrast* | *11.3 MB — which is why they are distance-based* |
| Journal photos | 20 photos ≈ **8 MB** |
| Check-ins, drink/eat logs | negligible |
| Full activity track | ~11 MB for a 12-hour day |

### 7.4 What this means

A worst case — the app, two full trek packs, Mapbox's own cache, a week of photos and a week of tracks — is **under 200 MB**, against a measured 10.77 GB available on this machine. **Space is not the constraint.** The three real constraints are:

1. **The iPhone's week-long clock**, which is why "Add to Home Screen" is a safety feature.
2. **The caps we set ourselves.** Today's map cache holds 1,500 tiles and throws away the least recently used, with no way to protect anything. Ordinary browsing between the download and the mountain can take a trip's tiles — including the small file that makes the rest of them findable, which offline is fatal rather than degraded.
3. **The 5 MB browser bucket**, until the database migration lands.

**One separate question worth the owner's attention:** the deployed app currently includes **280 MB of trail data** that is not saved for offline use and is not reachable without a signal. `dist/` is 381 MB in total today. That is not a Mountain-mode problem, but it is the single biggest thing in the deployment and it should be looked at.

---

## 8. Test plan

### 8.1 Tests that run on every change (cheapest, and they hold forever)

The app already has a test that walks the real chain of files on disk and fails the build if anything on the safety path could reach a network. It runs 30 of 30 green today. Extend it rather than write a second one:

1. The new Mountain-mode logic files join the strict tier — no network reach of any kind, machine-checked.
2. **CORRECTED — guard the SOS *screen*, not just its data.** The first draft checked that the emergency-numbers file was clean, which it already is. It did not check the screen. Because screens normally pull in the app's shared furniture, and that furniture reaches the login server, building the SOS screen on the usual components would quietly pull a login client into every cold start. **The SOS screen gets its own closure check and its own small components that import nothing shared.**
3. **CORRECTED — the map licence guard greps the source, not just the build output.** As drafted it checked the service worker file, which would pass today while a live licence breach continues in a React component (section 9). It now greps the whole source for the four forbidden map hosts, with a named allowlist per host — which turns the existing breach red immediately, and that is the point.
4. The emergency dataset gets a validator that reports **every** problem at once: dialable numbers must look like numbers, radio frequencies must not be reachable by a phone link, dates must be real and not in the future, every country a mountain touches must have either a record or a written-down reason, and **every source on a country record must be from the issuing authority** — which is what will fail the build until the Swiss attribution is fixed.
5. Assert that the alarm and the SOS button are present on each named route, including the live tracker.
6. Assert that the athlete's emergency info is imported by no sync code anywhere, and that its deletion function has a button behind it.

### 8.2 Real offline end-to-end, on a production build

The development server proves nothing — the offline machinery is switched off there, confirmed by measurement. These run against a real built copy with the network cut at the browser level. The whole sequence was done by hand this session and is scriptable.

| # | Scenario | Passes when |
|---|---|---|
| E1 | **Launch offline with a trip running today** | Mountain mode's Now screen draws, the SOS button is there on the first frame, and **no request leaves the page** (asserted from the network log, not from a screenshot) |
| E2 | **Launch offline with nothing running** | The "No signal — nothing is running" screen, with SOS on it |
| E3 | **Launch with the phone reporting "online" but nothing reachable**, with a trip running | Mountain mode — **this is the corrected boot rule, and it is the scenario the original design failed** |
| E4 | Open SOS offline on one of the fourteen mountains | The right numbers appear, the phone link is character-for-character correct, the network log stays empty |
| E5 | Open SOS offline with no trip and no country set | 112 with its **full note text present**, checked as a string |
| E6 | Open SOS with a stored position three hours old | Reads LAST KNOWN POSITION with its age; both coordinate formats match their expected shape |
| E7 | Open SOS with location permission denied | The denied wording, and **no disabled controls anywhere on the screen** |
| E8 | Open SOS with permission granted and no position ever | The "no position" screen, including the "say where you are in words" paragraph |
| E9 | Text-message row, both platforms | The right syntax for each, run twice with the phone type overridden |
| E10 | An old emergency number | The age line is in the warning style **and the call button is still enabled** — asserted so nobody "fixes" it later |
| E11 | Lose signal mid-activity | The banner appears, the screen does **not** change under the athlete |
| E12 | Dismiss the banner, then change screen | **It re-offers** — the corrected behaviour |
| E13 | Regain signal inside Mountain mode | The pill changes, items sync, **the screen does not leave the mode** |
| E14 | **The alarm fires while the live tracker is on screen** | It appears — this is the corrected mounting, and the original design failed it |
| E15 | The alarm's countdown across a backgrounded phone | Re-read from the clock, not the timer; correct after the app is away for ten minutes |
| E16 | A stale forecast | Shows its age and greys at the right thresholds; a very old one goes silent with a reason |
| E17 | **Cold open Mountain mode, offline, signed out, with nothing ever loaded** | Every tab draws. This is the test for the shared-state that Mountain mode no longer inherits by sitting outside the main shell |
| E18 | Emergency info survives a reload, then Delete | Present, then gone, and gone from every other stored key |

### 8.3 The phone test no automated test can replace

Cutting the network in a browser blocks requests. **It does not turn off a radio, and a headless browser has no GPS receiver.** So the tests above prove the screens draw and the links form. They do not prove a real fix in aeroplane mode. That is a measurement on a phone, with a written script, run before release, with the result recorded:

- iPhone and Android, aeroplane mode on, wifi and Bluetooth off, app opened from the home screen icon.
- **Time from opening SOS to the first fix, outdoors, clear sky.** This is the number the waiting sentence must be honest about — and until it exists, no duration is printed.
- The same under a face and in a valley: does it fix at all?
- Tap the call button: the dialler opens with the right digits. **Do not complete the call.**
- Tap the text row: the messaging app opens with the message intact, on both platforms. **Do not send.**
- **Battery: a full twelve-hour day, screen policy as shipped, GPS running, and record what percentage is left.** This is the test that decides whether the alarm's precondition is achievable (section 9).
- Aeroplane mode off then on again: the screen does not change under you.

---

## 9. Risks, open questions, and where the brief cannot be followed as written

### 9.1 The ways this could fail an athlete on a mountain

These were found by deliberately attacking the design. **All four are corrected in the text above.** They are repeated here in plain words because they are the reason to read this section.

**1. The mode would not have opened.** As first designed, Mountain mode opened when the phone said it was offline. On a mountain the phone usually says it is *online* — one bar with no data, a tea-house router with a dead uplink, a captive portal. So the athlete who force-quits to save battery and reopens would have got the login screen. **Fixed: a trip running today is the trigger, not the network.**

**2. The alarm would not have fired where it matters.** It was mounted inside Mountain mode's layout, but "Start activity" and the SOS screen both live outside that layout. On the two screens most likely to be open on a summit day, the turnaround alarm was silent. **Fixed: mounted above everything, fires on every screen in the app.**

**3. Battery saver could have removed the position from the SOS screen.** Turning off high accuracy lets the phone skip GPS and use wifi and mobile masts instead — and at 4,000 m there are none. **Fixed: high accuracy is forced whenever there is no signal and always on SOS.**

**4. The battery arithmetic does not close, and this one is not fully fixed — it is a decision for the owner.** A lit screen bright enough to beat snow glare draws roughly 1.5–3 watts. A phone battery holds about 12–13 watt-hours, and loses 20–40% of that below freezing. Twelve hours of screen-on is 18–36 watt-hours before GPS. **Following this design as originally written — app open, screen held awake, bright theme, GPS recording — flattens a phone in three to five hours, well before a 13:00 turnaround on a 02:00 start.** And a flat phone has no SOS, no coordinates and no symptom check.

Three changes made, one question left:
- **The screen lock is scoped, not standing:** held only in the last 30 minutes before turnaround, during an active SOS screen, and while the athlete is explicitly reading the map. Never all day.
- **The alarm is described as a backup.** The arming screen now says *"Set this on your watch or your phone's own clock"* first.
- **The bright theme carries its cost on the toggle:** *"A bright screen outdoors is the biggest drain on your battery."* Below a battery threshold, the app offers to drop brightness and release the lock, saying why.
- **Open question:** whether that is enough. The twelve-hour phone test in §8.3 is what answers it, and it should be run before this ships.

**5. On an iPhone the alarm is silent and cannot vibrate.** Safari has never supported vibration on any iPhone, and the hardware ringer switch silences web audio. In a chest pocket, the alarm is a colour change nobody sees. **Fixed in the copy at the moment the time is set**, not buried in a help page.

**6. Taking a journal photo kills the alarm, the screen lock and the GPS.** On an iPhone, the camera backgrounds the page, which releases the lock automatically, suspends GPS, gaps the breadcrumbs, and under memory pressure can discard the page entirely. **Fixed: a warning before the photo, and a single handler on return that re-arms everything and reports the gap.**

**7. "Open the full app" was a one-way door into an indefinite spinner offline.** **Fixed both ways** — the login check gets a four-second limit, and offline the row says it needs a signal rather than navigating.

**8. Dismissing the "switch to Mountain mode" banner stranded the athlete for the rest of the session.** **Fixed: dismiss means "not now".**

**9. The retrace bearing was exempt from going silent**, and it is the figure most likely to be dangerously stale — computed from where you were forty minutes ago, presented as a direction to walk. **Fixed: bearing comes from the current fix and is withheld when that fix is stale.**

**10. Every trek — all 252 — fell through to 112 in countries where we already hold the right numbers.** **Fixed: the country layer is part of shipping SOS, not a later phase.**

**11. The device clock is load-bearing and nothing checks it.** The alarm, daylight, the trip day and every "X ago" all resolve against it. A phone that flew to Kathmandu and never saw a network may still be on European time — and then every one of those figures is hours wrong, silently and consistently, which is the hardest kind of wrong to notice. **Partly fixed:** the turnaround time is stored as an absolute moment as well as the typed time, and both are shown with the time zone named; daylight states the clock it used; and where the phone's time zone disagrees with the objective's longitude by more than about 90 minutes, one row says *"Your phone's clock may be set to another country. Check it."* That disagreement is measurable, so it is not a guess.

### 9.2 Live problems in the app today, found while reading (not fixed by this work)

| | Where |
|---|---|
| **A live map-licence breach.** OpenStreetMap's own tile server is used on four screens with no attribution shown, which their policy requires. This is in production now and is not a Mountain-mode problem | `src/components/domain/MiniMap.tsx` |
| **Crash safety dies silently at about hour five** of a recording, and the frozen copy then restores as if it were current | `src/tracking/activeSession.ts` |
| **Filling the browser bucket signs the athlete out.** Observed while probing: driving storage to its limit dropped the app to the logged-out landing page | — |
| **The screen lock is never re-acquired** after the first time the phone is locked, and a second request orphans the first — measured: 2 requests, 0 releases | `src/tracking/useRecorder.ts` |
| **Ending a trip does not stop a recording.** The two pieces of code have never met | `src/trip/trip.ts` |
| **"Erase all data" is not complete**, and the comment above it says it is. Two unprefixed tracking keys survive it | `src/state/AppState.tsx` |
| **"Clear cached maps and photos" crashes** on a non-secure connection — which the app's own development setup deliberately supports. Its copy will also become a lie the day a trip's map lives in one of those caches | `src/screens/settings/Sections.tsx` |
| **The forecast is deleted after six hours**, not aged. From hour seven of a trip there is nothing to label | `vite.config.ts` |
| **A flag claims the app has a barometer.** It is set from a GPS altitude. There is no barometer | `src/tracking/recorder.ts` |
| **A network failure at the coach silently substitutes a scripted answer**, behind a fake 620 ms delay, so the athlete cannot tell a canned reply from a real one. The brief forbids this by name | `src/services/coach.ts` |
| **The coach screen prints "Trip · day −6" and "day 92"** — no date guard on the day arithmetic | `src/screens/coach/CoachHub.tsx` |
| **The first night of every trip never gets a sleeping-height ceiling**, and the instruction it prints to fix it cannot work | `src/trip/schedule.ts` |
| **Closing a trip strands it permanently** — no screen ever shows a closed trip again, and four functions that would reopen it have no callers | `src/trip/trip.ts` |
| **The house entrance animation plays for people who asked for reduced motion** | `src/components/layout/chrome.tsx` |
| **Two files disagree about whether the satellite imagery is licence-restricted.** One knows it is non-commercial only; the one nearest the code that uses it says it is free and unrestricted | `icefallStyle.ts` vs `trailImagery.ts` |
| **The world peaks list is 4.63 MB against a 6 MB cap.** If it grows past it, offline search silently collapses to the curated fourteen and nothing reports it | `vite.config.ts` |

### 9.3 Where the brief cannot be followed as written

| The brief says | What is actually true | The honest version |
|---|---|---|
| M6: build a per-country emergency dataset | It exists for 14/14 mountains, sourced, and the type already forbids an unsourced number | The work is a country key, a review state, a staleness rule and a dialling distinction — **not research** |
| M7: default to the itinerary's turnaround time | There is no itinerary and no turnaround field anywhere | The athlete or guide enters it; unset is visible and named |
| M5: next waypoint or camp with distance and ascent remaining | The app holds no route profile and no camp ordering for any peak on earth — its own code says so | Nearest recorded hut, straight-line, labelled as such. Ascent only when both heights exist |
| M5: pace vs plan | No plan carries times | Pace over the last hour, with no "vs" |
| M5 Map: a hatched hazard zone | Hazards are not in the data model at all | Pins the athlete or guide adds, dated, marked not verified |
| M5 Map: "Map saved 2 days ago" | The current cache can be emptied by ordinary browsing | Only after a proper pack exists, and only after counting the bytes that are actually there. A partial pack says how partial |
| M1: IndexedDB for trip data, and a sync queue | There is no server for trips, activities, checks, debriefs or journal | Two lines: a count for things with a destination, and "kept on this phone" for everything else |
| M1: request persistent storage | The browser decides silently and may refuse | Show what it actually said, with the reason |
| M2: a reachability check | The existing safety module refuses to make requests, with argued reasons, and a test enforces it | The check lives elsewhere, never blocks a screen, never overrides "no network" |
| M5: iOS needs a permission prompt for the compass | Out of date — Android needs one now too | Gesture-bound prompt on both, over a secure connection |
| M6: send SMS with my location | Apple's own reference says the message text must not be included | Two syntaxes, and the on-screen coordinates stay primary |
| M11: native gives large offline maps | A wrapper is still a browser running the same map code | Our own pack, which works on both |
| M11: the watch app | Not a wrapper feature, and `src/watch/` already means something else entirely | A separate native project, priced separately |
| Rule 2: stale safety data is greyed | For a phone number, a greyed dialling control is worse than an old number | The digits never grey. The age line carries it. **This is the one deliberate exception** |
| Rule 6: the existing app keeps working exactly as before | Moving activities out of the 5 MB bucket is unavoidable arithmetic, and it is a migration of every athlete's history | One-way, verified before deleting anything, resumable, with an honest failure state — and budgeted, not treated as a detail |

### 9.4 Open questions the owner should answer

1. **The theme toggle currently reloads the whole app.** Mid-summit-day that drops the GPS and the screen lock. The stated reason for the reload appears no longer to hold — the function it exists for has no callers. May the bright/dark toggle switch without reloading?
2. **Should trips, activities, checks and the journal ever reach a server?** Today none has a table. Until decided, the queue excludes them and the copy says "kept on this phone".
3. **Should documents and journal photos be backed up at all?** That needs a storage bucket and a decision about holding an insurance policy number on a server.
4. **Battery saver on by default during a recording** — it degrades exactly the slow-walking accuracy the app is tuned for, and altitude goes first. A named trade, not a silent one.
5. **Who would review the emergency numbers?** Eleven countries, two reviewers each, and the right reviewer is often a dispatcher rather than a guide. **Before building the review sheet, name two people who would sign Nepal.** If that has no answer, build the staleness labelling and skip the sheet — the design already makes "unreviewed" a fully good state.
6. **Does the map pack ship in the first release?** If not, the pre-trip check has no map row at all — it becomes one line of prose. A row that can never go green is not a check, it is a nag.
7. **Is a native wrapper on the table?** At $99/year plus $25 it is the only way the turnaround alarm works with the screen locked.
8. **The 280 MB of trail data in every deployment** — separate from Mountain mode, but worth a look.

---

## 10. What this costs to build

### 10.1 The honest total

**Ten to fourteen weeks for one experienced developer who already knows this codebase.** Not a fortnight, and not a month.

That covers roughly 80 new files, four new test suites, a one-way migration of every athlete's recorded history, a map build-and-host pipeline, a refactor of the most safety-critical data file in the repository, a fourth theme, and a change to how every existing user receives every future update.

### 10.2 What is genuinely small

| | Size |
|---|---|
| Daylight calculation and its tests | 2 days |
| Last-known position, coordinate formats, Copy | 2 days |
| Turnaround store, countdown, amber alert | 3 days |
| **Fixing the three screen-lock defects** — a bug fix everyone benefits from today | 1 day |
| **Keeping the forecast instead of deleting it, and showing its age** — closes a live honesty hole | 1 day |
| The boot decision | 2 days |
| Declaring Mountain mode outside the main shell, and moving the symptom check out with it | 2 days |

### 10.3 What is secretly large

| | Why | Size |
|---|---|---|
| **The emergency-numbers country refactor** | Looks mechanical. It is a pure refactor of the file that produces the numbers people dial in emergencies, plus a validator, plus re-sourcing the Swiss numbers, plus moving two caveats onto the rows that become call buttons | **1.5–2 weeks** |
| **Moving activities into the database** | Looks like a storage detail. It is every athlete's history, one-way, needing verification before deleting anything, resumability, a dual-read path for the interim, and an honest failure state | **2 weeks** |
| **The offline map pack** | Described in early notes as "one small library". It is an offline build step, a hosting decision, per-pack credits derived from the tile data, a manifest, a verification pass, and one unproven assumption to test first | **3 weeks, plus a spike** |
| **The update strategy** | Looks like config. It changes deployment behaviour for every existing user | **1 week including a staged rollout** |
| **Glove-sizing** | Looks like styling. At 64 px the current symptom check runs to about 5,000 px of scroll, which is what forces the one-question-per-screen flow — a new step-through over an existing engine | **1.5 weeks** |
| **The sync queue** | Small in code, large in decisions: most of what the brief calls sync items have no server, so the real work is agreeing what "waiting to sync" means | **1 week** |

### 10.4 The first shippable slice — three to four weeks

**No database. No sync queue. No map pack. No dataset refactor.** Every item is either a bug fix that helps the app today, or a new piece with no dependencies.

1. **Fix the three screen-lock defects.** The biggest technical obstacle to the alarm, and a live bug in the recorder every athlete already uses.
2. **Keep the forecast past six hours and show its real age.** Closes a live honesty hole today.
3. **Declare Mountain mode outside the main shell, and move the symptom check out with it.** This alone fixes a real hang: the one screen whose entire point is needing no network currently sits behind a gate that can wait forever.
4. **The boot decision** — a trip running today opens Mountain mode, synchronously, before the splash timer. Online behaviour byte-identical.
5. **SOS, over the data that already exists.** The emergency file unchanged except for the dialable/radio distinction, so a radio frequency cannot become a dead tap. Plus: last-known position, coordinates in both formats at the largest type on screen, accuracy and altitude with its error bar, **"Write these down"**, Copy, the honest text-message row, and 112 with its full note. Plus the one-file change adding a mountain identifier and country code to the trip record. **It works in aeroplane mode because the data file has zero imports and the lookup is instant.**
6. **Body tab** — the existing symptom check at glove size, one question per screen, with the third "Not sure" option added to both screens. Plus tonight's ceiling with all four of its existing silent states carried word for word. Plus "Unwell" showing the advice immediately.
7. **Now tab** — day label with the date guard, turnaround countdown defaulting to visibly unset, daylight from the new calculation, altitude with its error bar. Countdown re-read from the clock every time the screen returns.
8. **The alarm and the SOS button mounted above everything**, so they are present on every screen including the live tracker.

**Explicitly not in the slice:** the Map tab ships with the existing honest "we have not saved this area" screen, not a half-true "Map saved 2 days ago". Journal, documents, gear ticks, phrasebook, the sync queue and the coach queue all wait for the database.

**What that gives somebody on a mountain with no signal:** an app that opens, a turnaround countdown, daylight remaining, an altitude with an error bar, a symptom check that works and gives descent advice in the app's one voice, and an SOS screen with a real sourced number and their own coordinates in two formats.

**That is the entire safety case in the brief, and none of it needs a database.**

### 10.5 The order after the slice

| Phase | | Size |
|---|---|---|
| 2 | Update strategy + self-hosted fonts + the precache age check | 1.5 weeks |
| 3 | The on-device database + the activities migration | 2.5 weeks |
| 4 | Emergency-numbers country refactor, validator, data fixes | 2 weeks |
| 5 | Breadcrumbs, retrace, Map tab, "Centre on me" | 1.5 weeks |
| 6 | Journal, documents, gear ticks, phrasebook, Trip tab | 1.5 weeks |
| 7 | Sync queue, coach queue, pre-trip check | 1.5 weeks |
| 8 | Bright-snow theme, battery saver, large text | 1 week |
| 9 | **The map pack pipeline** *(can run in parallel from phase 3)* | 3 weeks |
| 10 | Review sheet, native seam, phone testing | 1 week |

---

## 11. Decisions needed before Step 2

Each has a recommendation, so approval can be one message.

**1. Approve the first slice as scoped (§10.4), three to four weeks.**
*Recommended: yes.* It delivers the whole safety case and touches nothing that needs a database.

**2. The offline map: build our own packs, or ship no downloaded map for now?**
*Recommended: ship no downloaded map in the first release, and say so honestly on the Map tab. Start the pack pipeline in parallel from phase 3.* It is three weeks plus a spike, and it is the only compliant route — no free tile service permits downloading an area.

**3. Native wrapper: yes or no, and when?**
*Recommended: plan for it, do not build it yet.* It costs $99/year (Apple) plus $25 (Google) plus review. It is the only way the turnaround alarm sounds with the screen locked. Building the seams now costs nothing extra and makes it a drop-in later.

**4. May the bright/dark toggle switch without reloading the app?**
*Recommended: yes.* The reason the reload exists appears no longer to hold. Reloading mid-summit-day drops the GPS and the screen lock.

**5. Should trips, activities, journal and documents ever reach a server?**
*Recommended: no, for now.* Say "kept on this phone" plainly, which the app already does well. Revisit when there is a reason beyond backup.

**6. Battery saver on by default?**
*Recommended: on by default outside a recording, off during one, and never when there is no signal.* It degrades exactly the accuracy the app is tuned for, and altitude goes first.

**7. Do we pursue the emergency-number review, and can you name two people who would sign Nepal?**
*Recommended: build the staleness labelling regardless; build the review sheet only if that question has an answer.* The "unreviewed" state is designed to be fully good on its own.

**8. The activities migration: automatic at the next launch, or behind a one-time prompt?**
*Recommended: automatic, but verified before anything is deleted and resumable if interrupted.* Prompting people about a database migration they did not ask for helps nobody, but it must be provably safe.

**9. The 280 MB of trail data shipping in every deployment — do you want that looked at?**
*Recommended: yes, separately.* It is the biggest thing in the deployment, it is not saved for offline use, and it is not reachable without a signal.

**10. Do we run the twelve-hour battery test on a real phone before the alarm ships?**
*Recommended: yes.* It is the test that decides whether the alarm's own precondition — the app open, the screen awake — is achievable on a summit day, and the arithmetic says it may not be.

---

This is Step 1. Nothing has been built. Approve or amend, and Step 2 follows.
