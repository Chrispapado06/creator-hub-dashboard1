# ICEFALL — flight notes backlog

**53 notes captured offline 30–31 Aug 2026. This file is the record. Nothing here
is closed by remembering it — it is closed by editing this file.**

## The rule

An item moves to `DONE` only in the same change that does the work. If you finish
an item and do not tick it here, it is not finished — the next session has no way
to know, and the owner has no way to check. Do not delete items; move them.

`BUILD`    — buildable now, no design or decision needed
`DESIGN`   — blocked: the owner is producing a design for this screen
`DECISION` — blocked: needs an answer from the owner (see DECISIONS below)
`DOING`    — in progress, name the session
`DONE`     — shipped, with the commit or file that did it

Statuses below were assigned by keyword on first pass and are a starting point,
not a judgement. Correct them freely.

## Decisions blocking work

**ANSWERED 2026-08-31 — three rulings from the owner. See `08-TRUST-RECORDS-CONTRACT.md`.**
- **Guide document checking: YES.** ICEFALL will read certificates and record that it
  did. NOT an association attestation — the existing honest sentence survives.
  Requires lifting `credentials_verified`'s `check (= false)` and replacing it with a
  named, dated, audited, expiring record. Expiry must revoke the claim automatically.
- **The START button: KEEP.** The mockup's nav change was a drawing artefact.
- **Recording what a customer agreed to: YES.** Must pin the exact terms text and the
  disclosures shown, immutably, including against staff. No back-filling.


- **D1 — operator safety notices.** Two notes ask to remove "ICEFALL does not vet
  operators" and "nothing you write is transmitted". Both are TRUE today. They can
  go when they stop being true: D1a when real operators are on the platform, D1b
  when enquiries actually send.

  **ANSWERED by the owner 2026-08-31: "safety notice will be on privacy policy and
  terms and conditions when you sign up."** The notices move off the screens and
  into the Privacy Policy and T&Cs accepted at signup.

  **ONE CARVE-OUT RAISED BACK TO THE OWNER, not yet answered.** Two of the three are
  policy statements and belong in terms: *"ICEFALL does not vet operators"* and
  *"sample directory, not real companies"*. The third is not a policy statement —
  *"nothing you write is transmitted and no reply will arrive"* describes what the
  Send button does. Moving it to a document signed months earlier leaves a button
  labelled Send that does not send. The honest fix there is not a notice at all:
  either build sending, or label the control for what it actually does. **RULED 2026-08-31: build the sending.**
  The owner chose "into the Company CRM" — enquiries land as an inbound queue and
  ICEFALL staff answer. The notice comes down **in the same change that makes
  sending real, per app, and not before.** See `07-ENQUIRY-CONTRACT.md`. The other
  two notices move to the Privacy Policy and T&Cs as previously ruled.
- **D2 — CRM Leads page.** Owner asked for a proposal. Proposed: replace it with an
  inbound queue — every enquiry across phone, web and operator portals, ranked by
  wait time. **ANSWERED 2026-08-31 — yes.** The owner's enquiry ruling settles it: the
  Leads page becomes the inbound queue, fed by the new enquiry table. See
  `07-ENQUIRY-CONTRACT.md`.
- **D3 — $9.99 tier. ANSWERED 2026-08-31: "Confirm."** AI coach per message and the
  5% guide discount out of commission are both intended. PH-20 Subscriptions is
  UNBLOCKED.
- **ENQUIRY SEND PATH (D1 carve-out) — BLOCKED on the migration, phone app.**
  Checked against the LIVE database by session 01, 2026-08-31, not inferred:
  `enquiries`, `enquiry_intake` and `operator_enquiries` all return **404**,
  while `support_tickets` and `leads` — which exist but are ungranted to `anon`
  — return **401**. So 404 here means genuinely absent, not merely unreadable.
  No enquiry migration is authored in `icefall-supabase/migrations` either.
  **The client cannot be written against a function whose name and arguments do
  not exist**, and writing one to a guessed signature would be both wrong and
  the §6c defect — instrumentation that reads as working and cannot fire.
  **The "nothing you write is transmitted and no reply will arrive" notice
  therefore STAYS UP.** Per the contract it comes down in the same change that
  makes sending real, and only once a row has actually been watched arriving.
  *Method note: a first probe called the RPCs with `{}` and got 404 for
  `open_support_ticket` too, which exists — PostgREST resolves an RPC by
  argument signature, so an empty body matches no overload. The 404s above are
  from table reads, which are sound, plus a control call with matching args.*
- **D5 — what replaces points on the Profile.** Raised by session 01, 2026-08-31,
  from the PH-01 survey. Removing ICEFALL points leaves a production Profile with
  no progression figure at all, because levels and XP were zeroed in August
  specifically on the grounds that points were the real one. Either the Stats tab
  loses its progression block entirely, or a real earned figure replaces it.
  **ANSWERED by the owner 2026-08-31: "Nothing, no points."** Option (a) — points go
  and NOTHING replaces them; the Profile stops claiming progression rather than
    substituting another figure. **PH-01's points half is UNBLOCKED.** The three
    sub-findings below still apply and the removal is not done until they are
    handled. PH-01's other removals (splits, elevation profile, "what this did to
  your progress", "what's next", personal bests, milestones) are NOT blocked.

  Three things that make this bigger than deleting a field, all found by Session 01:
  - **Existing phones keep their points forever.** `tracking/store.ts:32` parses
    stored activities with a bare `JSON.parse ... as RecordedActivity[]` — no version,
    no whitelist — and there is no migration point anywhere in the codebase.
    "Removed from the system" and "removed from the code" are different claims.
  - **The data export leaks points by key PREFIX**, so no grep for "points" finds it.
    `settings/Sections.tsx:931` walks every `icefall.*` localStorage key into
    `icefall-data.json`; a user's export would still contain `totalPoints`.
  - **Offline demo builds resurrect erased points.** `offline/seed.ts:90` runs at
    import, so "erase all data" is defeated on reload in demo builds. That file is
    the brain session's; Session 01 correctly did not touch it.

  **Trap: do not find-and-replace `points`** — it is also the GPS track:
  `RecordedActivity.points`, `MAX_POINTS_STORED`, the route map.
- **D6 — guide commission: 15% or 10%?** Raised by Session 05, 2026-08-31, from GU-03.
  The owner's note says *"ICEFALL still takes 15% commission"*. **Decision 3b settled
  10%**, deducted, against a worked example, and `GUIDE_COMMISSION_PCT = 10` was what
  every app in the family used at the time this was raised. Session 05 built the offer composer at 10% and
  **correctly refused to change the rate to match the note** — `money.ts` is not
  theirs, and a second rate in one family is exactly the drift that produced five
  commission models here before.

  **Is 15% a deliberate change or a slip?** If deliberate it is one edit plus
  `npm run sync` and every app moves together — including what guides are already
  told they receive. If a session had quietly built to 15, the guide app and the
  athlete app would disagree about the same booking.

  Note this is separate from an operator's rate: that is the referral stream, a
  different rate on a different basis, and `money.ts` warns in its own header that
  mixing the two on one booking is a real bug.

  **ANSWERED by the owner 2026-08-31: "Make it 15% comission." DONE.**
  `icefall-shared/money.ts` raised 10 -> 15 with the worked example rewritten
  (€1,000 day: climber pays €1,000, guide receives €850, ICEFALL keeps €150), the
  test suite's twelve baked-in expectations updated, and `npm run sync` run so all
  six apps moved together. 81/81 money + 14/14 companies green.

  One test needed a NEW INPUT, not a new number: `3335` cents was exactly 333.5 at
  10% — a true half-cent, which is the property under test (fractions go to the
  guide, never to ICEFALL). At 15% it is 500.25 and tests nothing. Changed to
  `3330` (= 499.5) so the assertion still means what it was written to mean.
  **GU-03c UNBLOCKED.**

- **D4 — verification badge. ANSWERED 2026-08-31 — THREE distinct marks:**
  **GOLD** = credentials checked by ICEFALL (guides; the existing gold treatment,
  wording unchanged). **GREY, small** = identity verified (any user who verifies ID).
  **BLUE** = paid member. Three different claims, three different marks, and none may
  borrow another's colour. Blue must never read as competence and grey must never
  read as credentials. CR-15 is UNBLOCKED to build the split.

---

## Phone App  ·  `icefall-app`
21 items — 14 buildable now, 4 waiting on design, 3 waiting on a decision

### `PH-01` ActivitySummary — **PARTIAL** · points DONE (D5 answered); flow + design halves open · session 01, 2026-08-31

> **SURVEYED BEFORE ACTING, AS INSTRUCTED. "Ice fall points should be removed
> from the system" touches 21 FILES, not five — so this is reported rather than
> done.** Full map in the session transcript; the parts that need a human are
> below. Ten files are code that would break or keep showing points; eleven are
> comments, copy, docs and the offline seed that would become false.
>
> **THE ONE THAT IS A PRODUCT DECISION, NOT AN EDIT — D5 below.** Levels and XP
> were deliberately zeroed in production (`state/AppState.tsx:584`) *on the
> stated grounds that points were the real earned figure and could stand in
> their place*. Remove points and a production Profile has **no progression at
> all**, while the DEV build still renders Level 24 / 12,540 XP from the fixture
> — i.e. the fake progression removed on 2026-08-28 becomes the only progression
> left in any build. Deleting points silently re-opens that.
>
> **Three things a mechanical removal would miss:**
> 1. **Old devices keep their points forever.** `tracking/store.ts:32` parses
>    `icefall.activities.v1` with a bare `JSON.parse ... as RecordedActivity[]`
>    — no version, no normalisation. Deleting the field from the type does
>    nothing to records already on a real phone, and there is no migration point
>    anywhere in the codebase.
> 2. **The data export leaks points by key PREFIX, so no grep for "points"
>    finds it.** `screens/settings/Sections.tsx:931` walks every `icefall.*`
>    localStorage key into `icefall-data.json`. After removal an existing user's
>    export still contains `totalPoints` and every `pointsBreakdown`.
> 3. **Offline builds resurrect deleted points.** `offline/seed.ts:90` runs at
>    import time, so "erase all data" (`Sections.tsx:1294`) reloads the page and
>    restores the seeded total. Erase is currently defeated in demo builds.
>
> **Do not find-and-replace `points`.** It is also the GPS track —
> `tracking/types.ts:297` `RecordedActivity.points`, `store.ts:22`
> `MAX_POINTS_STORED`, and the route map on the completion screen.
>
> **PH-05 (points off the completion screen) is DONE and did not need any of
> this** — see its entry. What is blocked is removing the CONCEPT.

#### PH-01 — progress note · session 01, 2026-08-31
- **DONE — points removed from the system, not just the code.** D5 answered
  ("Nothing, no points"), so nothing replaces them anywhere.
  - Engine deleted (`tracking/points.ts`), scoring removed from
    `tracking/finalize.ts`, `totalPoints` off `AthleteMeta`,
    `useLifetimePoints` deleted, `points_awarded` / `pointsBreakdown` off
    `RecordedActivity`.
  - Displays gone: the summary card, the completion card and its count-up
    (PH-05), the completion breakdown table and its "capped so there is never a
    reason to stay out longer than is safe" note, the Activity screen subtitle,
    the "ICEFALL points" row in Your year so far, and the Profile figure.
  - **Stage 3 of the completion screen went with it** — it existed only to
    unveil the breakdown, so its 3-second timer is gone too.
  - **THE PART THAT MAKES IT "THE SYSTEM":** `tracking/store.ts` now strips
    `points_awarded`, `pointsBreakdown` and `totalPoints` **on read**. Without
    it, every existing device kept its points forever behind a bare
    `JSON.parse ... as`, and they would have come straight back out of "Download
    my data" — which walks `icefall.*` by prefix, so no search for "points"
    would ever have found them. Verified: a planted legacy record with
    `points_awarded: 487` and a stored `totalPoints: 12345` come back clean,
    **and the GPS track survives** (`RecordedActivity.points` is the track — it
    was never touched).
  - Verified in the browser throughout.
- **DONE — the removals.** Splits, elevation profile, and the six panels ("your
  best today", "why it mattered", "your journey", milestones, personal bests,
  "what's next"). `components/domain/SessionSummary.tsx` was their only home and
  is deleted. Route, conditions and the headline metrics stay: those are what
  the activity WAS rather than an analysis of it.
- **NOT DONE — "Summary should be the only page after you finish an activity."**
  The completion screen still exists as a separate page before the summary, and
  the summary does not yet absorb replay / downloadable replay / share. That is
  a flow change plus PH-04 and PH-18, not a deletion. **This item stays open for
  that half.**
- **NOT DONE — "cleaner ui which will be done with ChatGpt".** The owner's own
  words say the design comes from them. Not invented.

#### PH-01 — the owner's original note
- **Design:** summary need much more simple, looking summary page . Ice fall points should be removed from thr system, cleaner ui which will be done with ChatGpt
- **Function:** Summary should be the only page after you finish an activity, that has the rest that are needed like run replay, dowload replay recording with showing distance that can be shared to social media. Lot of un neccesary details and info that are not needed to be removed like splits, elevation profile , see what this did to your progress , whats next , personal best and milestoned need to be removed. Useless

### `PH-22` Profile — the DEV level is now the only progression in the app — **DONE** · session 01, 2026-08-31
- **Found while doing PH-01.** Levels and XP were zeroed in production in August
  *because points were the real earned figure and stood in their place*. Points
  are now gone and D5 says nothing replaces them, so production correctly shows
  no progression at all — but the **DEV build still renders Level 24 / 12,540 XP
  from `data/mock/athlete.ts`**, and that fixture is now the only progression
  figure left in any build.
- That is the state the 28 Aug fix was meant to end, with the fake number harder
  to see rather than easier. It is behind `import.meta.env.DEV` so it does not
  ship — but anyone reviewing the app in dev, or screenshotting it, sees a level
  nobody earned.
- **Small:** delete the `xpToNext > 0` branch in `screens/Profile.tsx` and the
  three fixture fields. Split out rather than folded into PH-01 because it is a
  separate claim from points, and the owner may want the demo populated.

**Done 2026-08-31, and cut at the TYPE, not the render.** `level` / `xp` /
`xpToNext` are gone from `User` itself, with the reasoning left in the type
where the next person to want the fields will meet it. Removing the fields made
tsc enumerate every reader — exactly one, the Profile strip — which is the
§6-grade way to prove a delete is complete when `noUnusedLocals` is off.
Fixture fields, the AppState DEV gate and the render all went in the same
change.

One stale-prose find on the way through (PH-27's pattern again): the AppState
comment justifying the DEV gate ended *"the Profile shows points instead"* —
written before D5 removed points, so the comment was defending the fixture with
a fact that had stopped being true. Verified in the browser on the DEV build —
the build where the fake level actually rendered: Stats grid and Achievements
present, no Level, no XP figure, no "XP to level 25".

### `PH-02` ActivityHistory — **PARTIAL** · session 01, 2026-08-31
- **THE REAL FAULT WAS TWO DEAD LINKS, not a missing screen.** "Activity history
  can not be found anywhere" — the screen existed all along at `/activity`, but
  **both** links to it pointed at `/activity/history`, **which is not a route**
  (`Profile.tsx` and `settings/Sections.tsx`). Every way in was broken, so the
  only way to reach it was the redirect after finishing a workout — exactly what
  the owner described. Both fixed; zero `/activity/history` links remain.
  *This is the second time in this batch the note described a symptom whose
  cause was somewhere else.*
- **DONE — Performance and Routes views removed**, and `Journey` with them.
- **DONE — it is the user's own private list, reachable from the profile.** The
  Activities tab now says "Showing your 8 most recent of N" with a way through
  to all of them, rather than silently stopping at eight.
- **DONE — an icon per discipline on every row** ("there should be an icon or
  image if activity is running, hiking etc"). New `MODE_ICON`, keyed by
  `SportMode`: the existing `ACTIVITY_ICON` is keyed by the specific activity
  TYPE a recording was made with, which a history row does not know.
- **NOT DONE — "History should be more appealing, looks AI created".** A
  redesign with no design supplied; not invented. **Item stays open for that.**
- Verified in the browser: two tabs, 17 rows carrying their discipline icon,
  the profile route in working.

#### PH-02 — the owner's original note
- **Design:** there should be an icon o rimage if activity is running, hikinh etc . History should be more appealing, looks AI created - generated
- **Function:** Activity history can not be found anywhere only after you finish a workout. This section should be moved to profile activity which is only visible to the user no one else . performance page to be removed  same with routes

### `PH-03` ActivitySelect — **DONE** · session 01, 2026-08-31
- **Design:** No change
- **Function:** Needs to be an option to back out from the activity
- **DONE** — `src/screens/tracker/ActivitySelect.tsx`. There WAS an exit: the
  top-right button already called `navigate(-1)` and was labelled "Close" to a
  screen reader. It was drawn as a **mountain glyph in an azure ring**, which
  reads as a brand mark or a link to the mountains rather than a way out — which
  is why it could not be found. It is now an X in the same treatment step 2 of
  this flow already used, so backing out looks identical at both steps.
  Verified in the browser: the control is `lucide-x`, and pressing it leaves the
  screen.

### `PH-04` ActivityReplay — **BUILD**
- **Design:** good how it is, should be a share option where it gives metrics like distance, elevation, speed, calories etc

### `PH-05` ActivityComplete — **DONE** · session 01, 2026-08-31
- **Design:** Good, remove points
- **DONE** — `src/screens/tracker/ActivityComplete.tsx`. The "You earned +N
  ICEFALL points" card, its count-up animation and the `points_awarded` read are
  all gone — not hidden, since PH-01 removes the concept rather than the badge.
  Verified in the browser on a real recorded activity: the screen shows
  distance / moving / ascent and the actions, and the words "ICEFALL points" and
  "You earned" appear nowhere.
- **Note:** `activity.points` on this screen is the GPS track (lat/lon) and is
  NOT ICEFALL points. Anything sweeping for "points" must not touch it.

### `PH-06` Home — **PARTIAL** · session 01, 2026-08-31
- **Design:** Rather then Months calculating until target, make it to days, remove kit items  and training only keep days and readiness. This week needs small re design and conditions of weather should go exact under current objective
- **Function:** Remove recent activity and expedition checklist , upcoming, people near you and start an activity
- **DONE** — `src/screens/Home.tsx` (1147 → 949 lines).
  - **Days, not months.** The objective now reads "74 DAYS TO GO". Done with a
    local helper, NOT by changing `fmtCountdown` — that is shared by nine other
    surfaces (Goals, Coach, People, Conditions, MountainPage, cards) where
    rolling up to months is the right form.
  - **Two figures, not four** — days and readiness. Kit items and Training are
    gone; readiness still shows an em dash rather than a zero when it cannot be
    computed.
  - **Weather moved directly under the objective.** It had been three sections
    down, below the plan and the week, so the mountain and its forecast were
    never on screen together.
  - **Removed:** recent activity, expedition checklist, upcoming, people nearby,
    and the "Start an activity" card (the Start control is already on the tab
    bar, so it was redundant rather than merely surplus). The code left dead by
    those removals went too — the checklist memo, `UpcomingList`, and five now-
    unused imports. `noUnusedLocals` is off in this project, so that was checked
    by eye, not by the compiler.
  - Verified in the browser with a real objective 73 days out.
- **NOT DONE — "This week needs small re design".** A redesign with no design
  supplied; not invented (rule 2). **This item stays open for that half only.**
- **Noted, not changed:** the day count uses the same `Math.ceil` over elapsed
  milliseconds that `fmtCountdown` has always used, so a target set "73 days
  out" across the October DST change reads 74. That is consistent with every
  other countdown in the app; changing it here alone would make Home disagree
  with Goals and the Coach.

### `PH-07` Mountains — **DECISION** · safety notices — see D1
- **Design:** Objectives rather then have edit add the option of Remove and Add . Then when you click on each mountain routes should be shown in 3d satelite image. Preparation needs a full redesign, same with equipment.
- **Function:** Near me page, should be removed, since option exist on find. On the mountain page when you click on one terrain needs to be removed, set as my goal should be just a heart with an animation at the top. basically save . Peak data © OpenStreetMap contributors (ODbL) Removed + ASCENTS & CONDITIONS Removed. On equipment oage there should be anything for sale only show you blanc gear you need and the following text from expedition page to be removed:

- Guides
Sample directory. These are illustrative listings, not real companies — ICEFALL has no operator partnerships and does not vet, endorse or take payment for expeditions. Use them to try the enquiry flow, and find a real IFMGA-certified operator before booking anything.
FIND A REAL OPERATOR
Search certified operators for Mont Blanc
ICEFALL does not operate, guide or vet expeditions, and lists no operators for peaks outside its own catalogue — a guiding company invented by an app is a real danger. Permit rules and access change; confirm everything with the authority named here and the local guides office before you commit money or travel.

### `PH-08` Social — **BUILD**
- **Design:** People and groups need to be one page together. Groups where you can add mountain you want to climb and shows you people who are interested climbing with each other.
- **Function:** Add the ability for reels or videos to be posted by verified users with identity only . When reporting a post there should be couple optons to choose from and text to add under it. Also when you click on post it can then show you comments and when you like theres an animation. Following should be post made by people you follow via the app + my mountains is post on mountains you set as goals

+ big thing, we need to add stories as well so people can post stories, and click next like instagram scrolling via stories on the people you follow. We also want to introduce ads on stories + post scrlling a little bit . Social Page could be insane just needs correct management

### `PH-09` Expeditions — **DECISION** · safety notices — see D1
- **Design:** MOUNTAINS Page, the images need to be big bigger + have many more mountain options so it has a button at the end of the"Load More".

Now when you click on an expedition company profile on the app the following need adjustment in ui : OVERVIEW
EXPEDITIONS
REVIEWS
GALLERY
ABOUT

Hikes page should also be similat to mountains page with the design, ranking the top hikes. Also under the explore mountains, there should be explore hikes under it with the same concept mountains are to explore
- **Function:** remove the following at the bottom of page of EXPLORE:

CEFALL does not vet operators
No company here is checked, endorsed or paid for, and ICEFALL takes no part in a booking. The judgement stays with you.
Insist on IFMGA/UIAGM
The only internationally recognised mountain guide qualification. Ask for the guide's carnet, and verify it with the national association.
Enquiries stay on this device
No operator network is connected, so nothing you write is transmitted and no reply will arrive.

### `PH-10` Treks — **BUILD**
- **Design:** When you click on a trek provided by an expedition company page needs complete re design,
 OVERVIEW
THE ROUTE
PREPARATION 

and treks near is fine no need change
- **Function:** Treks page should replace at the expedition "trek to mountain page"

### `PH-11` Guides — **DESIGN** · needs your design first
- **Design:** Date selection should be modern , not old.

A guide is not a company info needs full redesign and i suggest that be added somewhere else
- **Function:** The treks or mountains that will be available are the ones that someone CAN go with a guide, theres mountains that its only expedition companies im pretty sure so make that clear.

### `PH-12` GuideProfile — **DESIGN** · needs your design first
- **Design:** Full guide page redesign when customer is looking for a guide-mountain, info should be split to sections not one thing eternal scroll
- **Function:** When you scroll and click on a guide, you should see the profile straight away not spawn mid page and scroll up

### `PH-13` GuideRequest — **DESIGN** · needs your design first
- **Design:** Needs full redesign again, think of it like AIRBNB where it says full price, you enquired for XYZ and then book guide or message guide

### `PH-14` CoachChat — **DONE** (a) and (b) · session 01, 2026-08-31
- **(a) DONE — the chat opens like a new chat, and the greeting is an intro.**
  It used to seed `openingMessage(ctx)` into the transcript, so the screen
  opened on a coach bubble that had never been sent. **Two faults, and the owner
  named the first.** The second is worse: that bubble read *"Based on your
  activity, sleep and progress toward Mont Blanc, here is what I would
  prioritise today"* — **and then prioritised nothing.** It announced an
  analysis it did not deliver, in the screen's own first sentence.
  Now: no seeded turn; a full-bleed intro that greets by name and fades out
  (`Hello, {firstName}.`); an empty thread that says what the chat is for
  without claiming to have read anything. Skipped entirely under
  `prefers-reduced-motion`, and `pointer-events: none` throughout so it can
  never swallow a tap on the composer while fading.
  Verified in the browser: greeting appears, empty state appears, no fake coach
  turn, composer live.
- **(b) NOT STARTED — trek suggestions from the real data.** *"if a client asks
  for suggested treks ai needs to look through the database and suggest 'near
  him' treks that fit the goal"*. This needs the trek dataset joined to the
  athlete's objective and location, inside the scripted coach — it is a feature,
  not a copy change, and the brief is explicit that a hardcoded suggestion list
  is worse than nothing. **Item stays open for this half.**

#### PH-14b — DONE 2026-08-31: trek suggestions are retrieval, not invention
`src/coach/trekSuggestions.ts`, wired into BOTH coach paths in
`services/coach.ts`. The flow is inverted from what a prompt instruction would
do: the module looks through the real `TREKS` records first and hands the model
the shortlist as data with a closed-world rule — *"these are the ONLY treks you
may suggest or name"*. A model told merely "suggest treks near their objective"
produces real-sounding treks ICEFALL does not hold; **its failure mode here is
generosity, not rudeness.** The scripted coach answers from the SAME retrieval,
so the offline coach and the model can never suggest different worlds — and the
trek-question regex is ONE exported pattern used by both, because I caught
myself writing it twice ten minutes after reporting that exact §6aa shape in
chat's locked-thread copy.

**"Near him" means near the OBJECTIVE, never the device.** Two bands: treks
linked to the objective's mountain (`mountainIds`), then same country by token
intersection. No third band — a "nearby" that has drifted to the same continent
is not near. Verified against the data:

| Objective | Basis | Result |
|---|---|---|
| Mont Blanc | mountain | TMB, Walker's Haute Route, Chamonix-Zermatt + 2 country |
| Aconcagua | country | 4 Patagonia treks — honest because the reply SAYS "in the same country as", not "near" |
| Mount Olympus | — | none: the catalogue holds no Greek trek, and the reply says exactly that |
| No objective | — | "Set an objective first…" |

Difficulty is relayed as the record's own grade with the fitness judgement
explicitly left open — "whether one suits where your training is right now is a
conversation, not a list." Verified in the browser: the chat answered the trek
question from ICEFALL's own records, linked to Mont Blanc, with the caveat.

#### PH-14 — the owner's original note
- **Design:** Animation before going into the chat with the agent. Agent saying hello Mr, Mdm (name) and fade out to the chat where client can message the bot. Remove the message that looks like its been sent, have it like you create a new chat with claude
- **Function:** I want if a client asks for suggested treks ai needs to look through the database and suggest "near him" treks that fit the goal the user has

### `PH-15` CoachPlan — **DESIGN** · needs your design first
- **Design:** whole redesign. Readiness should be remove but focused only only the plan of the day and helping with it

### `PH-16` CoachProgress — **BUILD**
- **Design:** full page re design + add animations when page is opened
- **Function:** remove un needed texts and user info, cut to the point

### `PH-17` Profile — **PARTIAL** · session 01, 2026-08-31
- **Design:** Stats Page re design
- **Function:** When you click on Icon it takes you to pprofile settings but when you back it takes you to settings, no it should take you back to profile from where you clicked
- **Function: DONE** — `src/components/settings/kit.tsx` + `src/screens/Profile.tsx`.
  Fixed in the SHARED settings page rather than at the one call site, because
  the bug was the default and not the screen: every settings sub-page hard-coded
  its back arrow to `/settings`, so any page linking into settings from
  elsewhere had the same fault. A caller now passes `?from=/profile` and the
  arrow returns there. Only same-origin paths are honoured (`//evil.example` is
  rejected — it is protocol-relative and would leave the app).
  Verified in the browser, all three journeys: profile → pencil → back now lands
  on `/profile`; the ordinary settings-list route still lands on `/settings`; a
  hostile `?from=` is ignored and lands on `/settings`.
- **Design: NOT DONE** — "Stats Page re design" is a redesign with no design
  supplied. Not invented; see rule 2. This item stays open for that half.

### `PH-18` ShareActivity — **BUILD**
- **Function:** Share activity should add the option to auto add it to the social media. only if you are verified

### `PH-19` Settings — **DONE** (19a–19d all closed) · session 01, 2026-08-31
- **Function:** Settings buttons and options need to work for example:

Account Details
Security 
Privacy - For example post can be seen only by friends or followers or public 

Professional Center should have real application links to apply to either be sherpa, company guide etc

> **Split before starting, per the shared rules — "all settings pages need to
> work" is not closed by fixing three.** Surveyed first; the four named pages
> are in genuinely different states, and one of them is already fine.
> **PH-19 closes only when 19a–19d all do.**

#### `PH-19a` Settings › Account — **DONE** · session 01, 2026-08-31
Reads the live session. Signed in: the real email, "Password: Set", and only the
providers the account actually carries — `email` filtered out, so an unconnected
Apple/Google is not listed as permanently "Not connected", which reads as a
broken integration rather than a choice not taken. Signed out still says there
is no account, because that is then true. The self-contradicting disclaimer
("your account is on ICEFALL's server … there is nothing to sign in to") is
rewritten per state. Verified both ways in the browser.
Every row is read-only and says "Not set" / "Not connected", and the page states
*"No account is attached to this device"* and *"there is nothing to sign in
to"*. **Real auth shipped this morning** (`src/auth/`), so that copy is now
false in the same way the support copy was — it apologises for a feature that
exists. Should read the live session.

#### `PH-19b` Settings › Security — **DONE** · session 01, 2026-08-31
Change password is a real control now — `sendPasswordReset` through Supabase,
with sending / sent / failed states and the address named. Passkeys and 2FA
still say "Not built", because they are not.
**"Active sessions: 1" is DELETED rather than corrected** — it counted nothing,
it was the literal number 1. On a security page a fabricated session count is
the worst figure to invent: somebody checking whether they have been broken into
would be reassured by a constant. The page now says ICEFALL does not track
signed-in devices.
Every row is `Unavailable` plus `NOT_BUILT`. Change-password is genuinely
possible now — `auth/account.ts` exports `sendPasswordReset` — and sign-out
exists. Passkeys and 2FA are honestly unavailable and should stay that way.

#### `PH-19c` Settings › Privacy — **DONE** · session 01, 2026-08-31
Post visibility added with the owner's three tiers — Public / Followers /
Friends — on its own axis, because a post always has an author and "private" is
not one of its answers. Stored, and it persists.
**Two things stated rather than papered over.** `followers` is a forward-looking
tier: `profile/following` records who YOU follow and nothing records who follows
you, so the option's own text says ICEFALL has no followers yet. And the page
says the choices are saved and **will be applied when posts can reach other
people** — nothing is transmitted today, so there is no audience to restrict.
Same shape as the notification preferences. A control silently promising to hide
a post from people who cannot see any post would have been a claim, not a
setting.
Profile / Activity / Summits visibility already work. **Post visibility does not
exist at all** — no `postVisibility` anywhere in the tree. The owner asks for
"friends or followers or public", which is a different set from the existing
`public | connections | private`.
**The honesty question this raises must not be skipped:** ICEFALL has no
backend for social, so nothing a post-visibility control promises can be
enforced by anything. A control that says "only my friends can see this" while
the platform cannot enforce it is a claim, not a setting. Either it ships with
that stated plainly, or it waits.

#### `PH-19d` Settings › Professional Centre — **DONE — it already worked** · session 01, 2026-08-31
Checked in the browser before changing anything, and **changed nothing.** All
four links route correctly (guide / expedition partner / sherpa / verification),
and the sherpa form accepts input, submits, persists to settings and shows its
status. The note said the Professional Centre needed "real application links";
it already had them. Applications store locally because there is no backend to
send them to, which the page says.
**Recorded because a fix that was not needed is worth as much as one that was:**
had this been "fixed" on the strength of the note, a working page would have
been rewritten.
Contrary to the note, the three links (guide / expedition partner / sherpa) are
real: they route to `screens/settings/Application.tsx`, a working 295-line form
with per-field entry, a status pill, submit and withdraw. **Needs checking in
the browser to find what the owner actually hit** — the fault may be elsewhere,
or may be that applications only store locally. Do not "fix" a working page.

All settings pages need to work

### `PH-20` Subscriptions — **DECISION** · pricing confirm — see D3
- **Design:** $9.99 you get:

- No Ads
- 1:1 AI Coach + Nutritionist
- Weekly Custom plans generated to your goals 
- Priority Support
- 5% Discount for any guide booked
- Verification Badge
- Access to Social Network Posting
- **Function:** $9.99 you get:

- No Ads
- 1:1 AI Coach + Nutritionist
- Weekly Custom plans generated to your goals 
- Priority Support
- 5% Discount for any guide booked
- Verification Badge
- Access to Social Network Posting

### `PH-21` Search — **DONE** · session 01, 2026-08-31
- **Function:** Can find guides, people and expedition company profiles on search

**Done.** Three sections added to the global `/search` screen, each reading the
SAME gated source its own screen reads — `allGuides()`, `allOperators()`,
`DISCOVERABLE_ATHLETES` — never the raw fixture arrays. A search surface is a
new reader of every list it indexes (§6aj at birth): reading through the gates
means production search inherits production truth with zero gating logic of its
own.

- **Guides** — name + credential + `credentialStatus` word + basedIn. The
  status word travels WITH the credential ("… mountain guide · Claimed"); the
  request-hero truncation bug is the standing lesson. DEMO chip on demo guides.
- **Expedition companies** — name, certification, regions. `responseHours` sits
  on that record and is the standing invented-response-time defect — it did NOT
  get a new surface. DEMO chip on demo operators, SAMPLE on sample listings.
- **People** — `displayName` and BIO only, never the objective, matcher and row
  both: typing a mountain and getting a list of who will be on it in March is a
  different product and one nobody opted into. Directory is empty until a
  backend exists, so the EMPTY state says in words that nobody is searchable
  yet — silence would read as "no such person exists".
- Disclosure chips render beside the TITLE, not after the detail, so truncation
  can only ever eat the geography, never the disclosure.

Verified in the browser: "falkenrath" → guide row with DEMO + Claimed and the
demo company; "himalaya" → sample listing with SAMPLE chip; a nonsense name →
Nothing-matches plus the people sentence. No response time anywhere.

### Mockups of 2026-08-31 — four screens, session 01

The owner sent four mockups and said "copy them 1:1". **Approved approach
(brain, same day): build every layout at full fidelity, and where the drawing
makes a claim ICEFALL cannot make, render the STRUCTURE with honest content.
Consent is not inferred from a drawing.**

#### `MK-01` Find a Guide — card layout — **DONE**
`GuideCardTall` in `screens/guides/shared.tsx`, on the results list at
`/explore/guides`. Portrait full-height down the left, name, credential with the
gold shield, location, then years / mountains guided / day rate in a divided
row — the owner's layout, copied. Every figure is a real field on `Guide`.
- **The one thing not copied:** the mockup's foot reads *"Documents checked by
  ICEFALL on 31 May 2026"*. Same slot, same weight, true content —
  *"Claimed by the guide. ICEFALL has not checked it."* The database
  **physically cannot record otherwise**: `credentials_verified` is
  `check (credentials_verified = false)`. If checks become real the sentence
  goes back here, in one place, fed by a record.
- `GuidePortrait` gained a `fill` mode rather than a second component — its
  `failedSrc` handling is keyed by URL so a reordering list cannot blank the
  wrong guide, and duplicating that to change a shape is how copies drift.
- Crop anchored `object-top`: centring cropped every face at forehead and chin.

#### `MK-HR` Heart-rate zones — **DONE**, on the brain's authority
Not a mockup question — a live defect the mockup exposed. **Swept for siblings
(§6s) and found three, not one:**
- `tracking/training.ts:71` — `detail: "Zone 2 throughout"` in a real module,
  the exact string `coach/sessionIntent.ts:14-25` forbids in three paragraphs.
- `data/mock/training.ts:37` — the same string in the fixture twin.
- `data/mock/activities.ts:72` — **the worst**: *"Heart rate stayed in zone 2 for
  78% of the session."* Not a label but a **percentage of a session spent in a
  band**, needing both a heart-rate stream and a measured threshold. ICEFALL has
  neither. A precise figure is the most convincing form an unmeasured number can
  take.
All three now describe effort verifiable against oneself, as prescribed.
**Deliberately NOT changed:** `routes/relevance.ts:94` (`id: "zone2"`, label
"Long aerobic day") and `coach/liveCues.ts` (`"fat-burn"`) are internal ids
whose rendered text is already honest — `sessionIntent.ts:57` names the
"fat-burning zone" misconception and refuses it. Renaming ids risks persisted
data for no user-visible gain.

#### `MK-VER` Guide verification — derived, not flagged — **DONE (display shape)**
Owner ruled YES to checking documents (`08-TRUST-RECORDS-CONTRACT.md`). **The
displayed sentence does not change yet** — no record exists for any guide, so
every card still reads *"Claimed by the guide. ICEFALL has not checked it."*
What changed is the shape, so the day a record lands the app is already correct.

`guides/verification.ts` derives state from the record on every render:
`unchecked` / `checked` / `expired`. **No boolean anywhere.** An expiry that
passes takes effect without anyone clearing a field, and a record missing its
checker or its date cannot render as checked.

**I SHIPPED THE EXACT BUG I WAS WARNED ABOUT, AND A TEST CAUGHT IT.** The first
`parseInstant` was `new Date(iso)` guarded by `Number.isFinite(getTime())` —
which looks like validation and is not. **`new Date("31 Dec 2028")` succeeds.**
That is the display string from the original incident: it parsed cleanly, landed
in the future, and rendered an expired certificate as **checked**, under a
comment claiming the function failed closed.

The real hazard is not a string that throws — it is a lenient parser returning a
**plausible** date. `"12/31/2028"` and `"31/12/2028"` both parse and mean
different days. That ambiguity *is* how the original bug read a date "a day
early". Now: strict ISO shape check, then a calendar round-trip so `2026-02-31`
(which matches the pattern and silently becomes 3 March) is rejected too.

Verified across eleven cases — only a valid ISO instant and a valid plain ISO
date claim `checked`; `"31 Dec 2028"`, `"12/31/2028"`, `2026-02-31`, a missing
expiry, an unnamed checker and a non-ISO check date all render as not checked.

**Never becomes "Verified guide".** The second half of the sentence — *"We have
not contacted the issuing association"* — is the whole limit of the claim.

#### `MK-VER2` The arguments that go stale when the migration lands — **DONE**
Session 03 is **dropping** `credentials_verified` rather than unpinning it — a
stored TRUE outliving certificate expiry is the lapsed-insurance bug one layer
down. Three things in this tree referenced it:

- **`backend/types.ts`** declared `credentials_verified: boolean`. Removed. After
  the drop a `select=*` returns no such field, so code reading it would compile
  and get `undefined` forever — harmless (undefined fails closed) but silent.
- **`screens/guides/shared.tsx`** justified the honest sentence by citing the
  `CHECK (= false)`. **That is the dangerous one.** A future reader would find
  the comment, discover verification now exists, and conclude the sentence can
  go. Rewritten so the argument survives the schema: it was never *"we cannot
  check"* — it is **"ICEFALL read the papers; the issuing association did not
  confirm them"**, which stays true after checking exists, and is the whole of
  the exposure. The comment now says explicitly that the reason expired and the
  sentence did not, and that dropping the second clause is the edit that looks
  like tidying and is actually the liability.
- **`screens/Expeditions.tsx`** cited the same constraint as a parallel for not
  showing a company tick. Rewritten: ICEFALL now checks a GUIDE's certificate
  and still vets no COMPANY, so the conclusion holds on a different reason. The
  comment warns against reading "verification exists now" as licence to ungate.

**Swept the rest of the tree for the same class** — honest copy justified by a
schema fact that could change. No others: the only remaining `CHECK` citations
are the two historical notes above.

§6aa with the stakes visible: **a stale comment is most dangerous exactly when it
explains why something careful was done.** Nobody greps documentation when they
change a schema.

#### `MK-02` Request Guide — price breakdown — **DONE**
`screens/guides/GuideRequest.tsx`. The mockup's structure copied: the guiding
line with its arithmetic shown (`€620 × 1 day`), then a total, then what is not
included.

**TWO OF THE MOCKUP'S THREE PRICE LINES ARE NUMBERS ICEFALL DOES NOT HAVE.** It
itemises *"Hut fees €80 × 6 days × 2 climbers"* and *"Permits €60 × 2
climbers"*, totals all three as **"TOTAL (ALL IN) €4,980"**, and captions it
*"The price you see is the price you pay."*

ICEFALL holds no hut tariff and no permit schedule for any route. Inventing them
is worse here than almost anywhere else in the app: **a climber budgets against
this screen**, arrives, and finds the hut charges something else. And "ALL IN"
is the line that does the damage — it converts an estimate into a promise and
makes the other two unrecoverable.

So the guiding fee, which IS known, with the arithmetic exactly as drawn; the
pass-through costs **named but not priced**; and the total labelled "Guiding
total" for what it actually covers. The mockup's caption survives where it is
true — the guide's rate is what the client pays, because ICEFALL's commission is
deducted from the guide rather than added to the client.

Verified in the browser: renders the arithmetic, never says "all in", and
invents no hut or permit figure.

#### `MK-03` Availability calendar — **DONE, and populated in demo**
`screens/guides/AvailabilityCalendar.tsx`, in the Request-a-guide date field.
Month header with arrows, weekday row, the chosen range filled, a dot under each
day, and the Selected / Available / Limited legend — the owner's strip, copied.

**Owner ruling 2026-08-31: "EVEN IF IT TAKES ADDING FAKE DETAILS JUST COPY THE
DAMN MOCKUPS."** That is what the demo flag exists for and it is followed here.
In a demo or offline build the dots are drawn and the legend appears; the screen
looks like the drawing.

**The dots are deterministic from the guide's id**, not random. A calendar that
reshuffles between renders is obviously fake *and* useless for judging a design —
the owner cannot evaluate a layout that will not hold still.

**Production is unchanged and that is what makes this safe.** ICEFALL holds no
diary for any guide — `Guide.availability` is a standing status, not a calendar —
so with the flag off there are no dots, no legend, and a line saying the calendar
picks the athlete's own dates and claims nothing about who is free. Verified:
the demo path renders the legend and the production sentence does not appear.

Local `YYYY-MM-DD` parsing throughout — `new Date("2026-07-15")` is UTC midnight
and lands a day early west of Greenwich, which this project has fixed several
times.

#### `MK-02b` Price breakdown — filled to the mockup in demo — **DONE**
Owner ruling 2026-08-31: *"EVEN IF IT TAKES ADDING FAKE DETAILS JUST COPY THE
DAMN MOCKUPS."* Confirmed by the brain as covering the priced pass-through
lines, and taken.

**Demo / offline build** now renders the mockup: `Guiding €620 × 6 days =
€3,720`, `Hut fees €80 × 6 days × 2 climbers = €960`, `Permits €60 × 2 climbers
= €120`, **Total ALL IN €4,800**, with *"The price you see is the price you
pay."* The hut and permit figures are the owner's own from the drawing, and the
card says on screen that they are invented and that ICEFALL holds no tariff.
The demo also opens on a **six-day window and a party of two**, because a
breakdown reading "€620 × 1 day" demonstrates nothing — the owner is judging
whether the arithmetic reads, and it cannot read with nothing to multiply.

**Production is untouched:** one day at the objective's target date, party of
one, pass-through costs **named but not priced**, and the line saying ICEFALL
holds no hut tariff or permit schedule and will not guess. That split is the
whole reason filling the demo is safe.

**Why I asked before doing this rather than inferring it.** The empty-screen
instruction was about screens rendering nothing; a priced hut line is not an
empty state, it is the one number on this screen a climber budgets against
before they travel, and "ALL IN" converts an estimate into a promise. The
answer — a demo behind a flag under a SAMPLE DATA banner has nobody to mislead —
is right, and it is the reasoning that makes the difference, not the instruction
alone.

**Still held, and no fill instruction reaches them, because they are rulings and
not empty states:** the certification wording, the absent federation roundel,
and the enquiry notice.

#### `MK-01b` Find a Guide — the FRAME, not just the content — **DONE**
Rebuilt against `mockups/phone-2.png` after the owner rejected the CRM pass with
*"similar isnt enough can you not make them 1:1"*. Standard: build and mockup
side by side at the same width; if structure alone tells you which is which, it
is not done. Checked element by element in the browser:

| Drawing | Was | Now |
|---|---|---|
| Two separate selector tiles, glyph left, small label **above** value, chevron-down | One card of three label-left rows | Two tiles, as drawn |
| "Select your dates" + calendar **always visible** | No calendar on this screen at all | Inline, always visible |
| Selected / Available / Limited legend | — | Present |
| "N guides available" · "Clear filters" | "Best matches for you" + subtitle · "See all" | As drawn |
| "More filters", full width, outlined, at the **foot** | "Filters" chip **above** the list | Moved to the foot |
| No explanatory callout | `DemoGuidesNotice` box | Removed — per-card DEMO chips carry the disclosure |

The calendar's demo pattern is seeded `"directory"` on this screen: one stable
key for the whole search, so the dots do not move as results change.

**Not a redesign of the app's idiom — the drawing's idiom.** The old
label-left row card read as a settings list; the drawing's is a search.

#### ⚠️ `mockups/phone-1.png` IS NOT A PHONE SCREEN
It is the **CRM Dashboard** — light theme, left sidebar, world map, revenue
donut, Recent Bookings / Recent Enquiries tables. Misfiled under the `phone-`
prefix. **Session 03 needs it and may not know it exists.** Not phone scope, not
built here. The four genuine phone screens are `phone-2` (Find a Guide),
`phone-3`, `phone-4` and `phone-5` (Plan).

#### `MK-02` Request Guide — the FRAME — **DONE**
Rebuilt against `mockups/phone-3.png`. The gap was not content, it was genre:
the drawing is a **receipt**, mine was a **form**.

| Drawing | Was | Now |
|---|---|---|
| Full-bleed hero: round portrait, name at 25px, qualification, pin + town | A 46px thumbnail in a pinned strip | Hero, as drawn |
| Rows: glyph left, label, answer **right** in white | `section-label` left, value left | Right-aligned, glyph left |
| One price card: rate, huts, permits, **TOTAL (ALL IN)** | Two cards with a "Guiding total" between | One card |
| WHAT HAPPENS NEXT, ⓘ in a ring | — | Present |
| Two controls at the foot | One "Submit request" | Message · Send request |
| Lock line at the foot | Lock line | Kept, reworded |

Three things the drawing asked for that could not be copied as written:

- **"Luca will receive your request and reply."** Two futures ICEFALL cannot
  promise — there is no server behind this form. The card keeps its shape and
  position; inside it says what the app actually does.
- **"Secure request · No payment taken yet."** "Yet" promises a payment step
  that does not exist and "secure" describes a transmission that does not
  happen. Replaced with *"Held on this device · no payment, no card, nothing
  sent."*
- **"BOOK GUIDE."** It does not book a guide.

And **"TOTAL (ALL IN)" now says `guiding only` in production**, where the hut
and permit figures are absent. The drawing's promise cannot outlive the numbers
that justified it.

Two bugs found by looking, which is the whole argument for looking:

- The hero **truncated the qualification line**, and the ellipsis ate
  `· Claimed` — leaving "IFMGA / UIAGM mountain guide" reading as a fact
  ICEFALL had established. The qualifier is the half that must never be the
  half that falls off the end. It wraps now.
- `rounded-full` passed through `className` **silently lost** to the component's
  own `rounded-tile`: the class merger does not know a project token belongs to
  the radius group, so the portrait stayed a square while the code said circle.
  Fixed with a real `circle` prop — including on the initials fallback, so a
  guide with no portrait is not the one square in a row of circles.

**Still a form, not a receipt.** The rows are the pickers, so they keep their
chevrons: a control that does not look like a control is worse than a stray
glyph. And the Experience row is a fifth row the drawing does not have — it is
what a guide decides on, and deleting it is a product decision, not a layout one.

#### ⚠️ `PH-23` Request Guide renders inside the Explore tab chrome
The screen shows "Explore" + the MOUNTAINS/SOCIAL/EXPEDITIONS/TREKS/GUIDES tab
rail **above** its own "Request Guide" header — two headers stacked. The
drawing has one. `App.tsx:329` nests `guides/:id/request` under the Explore
layout. Moving it is a navigation change (where Back goes, whether the tab rail
survives), so it is raised, not done.

#### `MK-03` Guide profile — the four tabs — **DONE**
Against `mockups/phone-4.png`. The tab set was half right: four tabs already,
but labelled **About / Experience / Reviews / Availability**. The drawing names
**Overview / Experience / Certification / Availability**.

- `Reviews` → `Certification`. The drawing is right to drop it: a review needs a
  completed ICEFALL booking and none exists, so the tab could only ever say
  "nothing here". Its content moved into Overview under a `Rating` heading.
- Foot: one full-width azure **"Enquire with Ines →"** — the guide's first name,
  because that is who you are writing to — replacing a small right-aligned
  "Request" chip. The rate keeps its line above it (the drawing has no rate at
  the foot; a price is not a thing to make an athlete hunt for).
- "Mountains" → "Mountains & routes", as drawn.

**Two of the drawing's certification details do not ship, and both outrank it:**
the **IFMGA roundel** (a federation's mark on a guide's page reads as that
federation endorsing the listing — they have endorsed nothing, and the mark is
theirs) and **"Documents checked by ICEFALL on 31 May 2026"** (ICEFALL has seen
nobody's documents; every credential's status word is `credentialStatus`, which
returns "Claimed" for every guide in this build).

**A bug I wrote and caught in the same pass, worth recording because the near
miss is the lesson:** folding the Reviews tab into Overview, I copied its
*no-rating branch* rather than calling the component — so a demo guide who does
carry an invented rating would have been told flatly **"No rating"** on the same
screen that displayed one. The component knows which of its two cases it is in;
a copy of one of them does not. Inlining one branch of a two-branch component is
how a conditional becomes an assertion.

#### `MK-04` Home / Plan — session card, timeline, week strip — **DONE**
Against `mockups/phone-5.png`. Three additions, all rendering unconditionally
per the owner's *"build things on the acc apps"* ruling — the layout is the
production design; only invented FIGURES stay gated.

- **Today's session** gains the duration in azure beside a clock at headline
  size, the session's own sentence under a rule, and the drawing's two controls
  — filled **Start session**, outlined **Mark as done** — replacing a single
  round tick that said nothing about what it did and offered no way to begin.
- **SESSION PLAN**, the vertical timeline: dot rail, name over minutes left,
  note right, em dash on `Focus` exactly as the drawing does on its own last row.
- **THIS WEEK** gains the seven-circle day strip and a completed count.

**The segments do not exist in the data.** ICEFALL prescribes a session and a
LENGTH; it holds no per-athlete breakdown. So the minutes are that length split
15 / 70 / 15, the remainder pushed into the main set **so the parts always sum
back to the prescribed total** — a timeline whose rows do not add up to its own
figure is worse than no timeline — and one line under the card says the split is
the standard shape of a session, not a breakdown chosen for you. A session too
short to divide is left whole rather than cut into fragments that misrepresent it.

**The drawing's session text does not ship.** It reads *"Steady pace in Zone 2"*
and *"Bring HR down gradually"*. ICEFALL has measured nobody's heart and holds
no threshold to divide one against, so there is no zone to name. Effort stays in
words until a device pairs — which is exactly what the HR ruling permits and
does not permit.

**The count is "of PRESCRIBED", not "of 7".** The drawing reads "3 of 7
completed". A week with a rest day has six sessions, and calling it seven marks
an athlete down for resting when they were told to.

The strip reads `completedByDate` / `satisfiedByActivity` — the same pair the
tick above it writes — so it cannot disagree with the control directly above it.

`parseDay` returned `Date | null` and **tsc caught the unchecked call**; the
array index is the honest fallback, since a week is seven days from its start.

**The bottom nav is untouched.** The drawing shows Plan / Train / Explore /
Guides / Profile; START stays, per the owner's standing ruling.

#### `PH-24` Enquiry wire — PROBED, and the phone app CAN name a real object
Before wiring Send I checked whether this app has anything real to enquire
about. Its operators are invented with slug ids (`op-himalaya`), its trips are
client-side, its mountains live in a directory literally called `data/mock/`,
and it has **no read access to `destinations`** — `GET /destinations` returns
`401 / 42501`, "permission denied". So the app cannot list valid objects, and I
expected to have to report the send path blocked.

**Two probes settled it, and neither wrote a row.** Both omit `sender_email`, so
the visitor policy must refuse both; the only question was WHICH check fires
first:

| `destination_id` | Result |
|---|---|
| `mont-blanc` | `401 / 42501` — *"new row violates row-level security policy"* |
| `zzz-nonexistent-probe` | `400 / P0001` — *"no such mountain or trek"* |

The nonsense slug is **refused by the object check before RLS is reached**. The
real one gets **past** that check and is stopped only by the missing email.
**Therefore `mont-blanc` resolves to a real destination row**, and the phone
app's mountain slugs are the right shape for `p_destination_id` after all.

Two things worth keeping from the method:

- **A refusal is a reading instrument.** Comparing WHICH error fires told me a
  row exists without granting myself the ability to read it, and without writing
  anything. `42501` vs `P0001` is the whole answer.
- **`401` still means exists-but-ungranted, `404` means absent** (§6ac).
  `open_enquiry` itself answers `401 / 42501` to `anon` — it EXISTS and anon has
  no EXECUTE, which matches the contract: anon inserts direct, the function is
  the signed-in path. The control probe (`open_support_ticket` with `{}` → `404`
  by argument-signature resolution) confirms the two codes discriminate.

**The operator stays out of the enquiry.** `company_id` is a uuid and these ids
are slugs, so the FK would refuse — and per the contract that is the constraint
working. An enquiry from a trip page names its MOUNTAIN, which is real, and
never silently becomes a lead about an invented company.

**Not wired yet, and deliberately.** Sending one real row into the owner's live
CRM queue is outward-facing, and my instruction for it came through a peer
rather than the owner's own window. Asked; waiting.

#### `PH-25` Enquiry send path — WIRED, not yet fired
`src/enquiries/send.ts` + the compose screen. `open_enquiry` with
`p_destination_id` = the mountain's slug, `p_origin_app: "phone_app"`.
`object_label` is never sent — a BEFORE INSERT trigger resolves it on every
path, so a client that sends one only teaches the next reader that it matters.

**The uuid is not shown.** `open_enquiry` returns `{ok, id}`, and a raw uuid is
a fabricated receipt: the shape of a reference with none of the use, because the
sender cannot quote it to anybody who could look it up. The signed-in athlete's
real proof is being able to read their own row — `S4 "My enquiries"` is where
that belongs.

**The operator is deliberately NOT on the row.** These ids are slugs
(`op-himalaya`), `company_id` is a uuid, and the FK would refuse — which is the
constraint working. The operator travels in the body where a human reads it for
what it is. Nobody's question is silently changed into a different one.

**The notice comes down PER PATH, not with a delete key.** `enquiryGate` decides
per enquiry, before a word is typed:

| Gate | Notice | Control |
|---|---|---|
| `ready` (signed in + peak resolves) | "goes to ICEFALL's desk, not the operator; reply to {email}" | **Send to ICEFALL** |
| `local-only` (signed out / unknown peak / no backend) | held-on-device, unchanged | **Save to enquiries** |

The held-on-device sentence is **still true** on the second path, so it stays —
"amend only the sentence that became false". The control is renamed for what it
does on each path: "Save to enquiries" was honest when nothing ever sent, and
would be a lie in the other direction now.

The gate is **per-enquiry, not per-session**: an unknown peak stops this message
even for a signed-in athlete. A screen that promised delivery on the strength of
a session and then failed on the object would have been lying for the entire
time somebody sat there typing.

**A failed send does not navigate away and does not claim success.** The local
thread is written either way — it is the athlete's own copy and losing it to a
network error helps nobody — but the screen stays put and names the failure,
with "unreachable" and "refused" kept apart: one is worth retrying, the other
never is.

Verified in the browser signed out: held-on-device notice, "Save to enquiries",
no desk claim. `Mont Blanc → mont-blanc` resolves, and `mont-blanc` is proven
real (`PH-24`).

**NOT FIRED.** No row has been written. Waiting on the owner's own go-ahead.

#### `PH-26` Calories (3) — pace and gradient — **DONE**
`src/tracking/energy.ts`. The ACSM metabolic equations replace the fixed MET:

    running   VO2 = 0.2 x S + 0.9 x S x G + 3.5
    walking   VO2 = 0.1 x S + 1.8 x S x G + 3.5

S in m/min, G fractional, MET = VO2 / 3.5. Applied **per position sample**, not
to an average — averaging the pace first flattens the hills back out and gives
back the constant this was meant to remove.

**The complaint, measured.** One hour of running at 10 km/h for a 72 kg athlete:

| | Old | New |
|---|---|---|
| Flat | 720 kcal | **758 kcal** |
| 10% climb | 720 kcal | **1,066 kcal** |

A 41% difference where the old code returned an identical figure. That is what
the owner meant by *"when running calories were inaccurate"* — not that the
number was off by a few percent, but that it did not move.

**Checked against the compendium, in the repository.** `energy.fixture.ts`
holds seven published MET values and the model reproduces all seven within
±1.2 MET (10 km/h flat -> 10.5 vs 10; 5 km/h at 15% -> 9.8 vs 9.8). The point of
citing a published basis is lost if a coefficient is transcribed into the wrong
place — a mistyped equation still looks authoritative and is no better than the
constant. `metEstimate` was never checkable against anything; this is.

**The guards are behaviour, not comments** — `energyGuardFailures()` proves each:
steep descent never costs nothing or less; a 300% grade from an altitude spike
is clamped; a 40 m/s GPS jump is clamped to 25 MET; standing still returns null,
never a zero; and **cycling does not borrow the equations** — they describe
running and walking, and applying them to a bike borrows a published equation's
authority for a number it was never fitted to.

**Gaps are not costed.** Intervals longer than 30 s are skipped: a backgrounded
app can leave minutes between samples, and costing that span at the pace of the
sample that ENDED it invents the energy of everything in between — the classic
way an activity comes back from a tunnel with a personal best attached.

Indoor work keeps the fixed MET, since a treadmill has no GPS to integrate. All
three calorie items are now closed.

#### `PH-27` S1 blocker — the stale access rule is in TWO places, not one
Confirmed the peer's finding in my own tree, and it is bigger than reported.

**The code.** `screens/chat/data.ts:81`

    export function isLocked(c: Conversation): boolean {
      if (c.kind === "guide") return !c.booking;      // pay to open
      if (c.kind === "company") return !c.introduction;
      return false;
    }

Its own comment says *"One function, so no screen can decide differently"* —
which was good discipline and is exactly what makes it dangerous now: every
screen decides correctly, and correctly means a rule the product has rejected.
`Thread.tsx:73` and `Messages.tsx:238` both read it.

**The half the finding did not mention, and the half most likely to be missed
because it is not logic.** `data.ts:450`:

> *"You can message a guide once you have booked them."*

A user-facing sentence asserting the same superseded rule. Deleting `isLocked`
and wiring the policies would leave this paragraph on screen, still stating the
old gate to the reader, and no typecheck or policy would catch it. **A stale
rule enforced in code fails loudly the first time somebody hits it; a stale rule
written in prose just keeps being believed.**

So when the gate moves to the database (`send_message` -> `messages_insert`'s
four conjuncts), `LOCKED_EXPLAINER` and `LOCKED_EXPLAINER_COMPANY` are part of
the same change, not a follow-up.

**Not touched now, deliberately.** S1 is blocked on the owner pushing
`20260831140000_messaging.sql`, and nothing in the phone app sends yet — so the
sentence describes the mock accurately for as long as the mock is all there is.
Changing the copy before the capability would be the mirror of the mistake:
saying a channel is open when nothing can travel through it.

#### `PH-28` Displacement pre-audit — one of the three shapes, and a different fault
Ran Session 05's three reader classes against my tree before the samples move,
rather than after. **Two of the three are absent here:**

- **localStorage seeded from samples** — none. Nothing under `screens/chat/`
  touches it.
- **`useState` initialiser snapshotting** — none.
- **A COUNT** — present: `Home.tsx:75`, `conversations.reduce((n, c) => n + c.unread, 0)`,
  rendered as the badge on the Home top bar.

**The count is not the fault I expected, and the real fault is the opposite
one.** The badge is derived from the gated list rather than hardcoded, and
`DEMO_CONVERSATIONS` is gated on `import.meta.env.DEV` at the DEFINITION — so a
production build sums an empty array and the badge is 0. That part is already
right.

**What is actually wrong is on the REAL side.** `useConversations` maps every
real thread with `unread: 0` — hardcoded, because nothing tracks read state
today. So the moment `mark_thread_read` exists, the badge will **under-report
real messages while continuing to count invented ones**: in a DEV build it
would show 5 unread, every one of them from a conversation nobody had, while a
genuine unanswered message contributes nothing.

That is the same failure Session 05 found, arriving from the other direction —
not a stale count surviving the sweep, but a count that was only ever honest
because both halves were zero.

**And the merge shape is already written**, waiting to become wrong:

    return [...real.sort(byRecency), ...invented];

Correct today only because `invented` is empty in production. When real threads
land this must DISPLACE, not concatenate (§6aj) — the append is not a bug yet,
which is exactly why it will not look like one.

Recorded now so the audit is ready when the 140000 push lands, rather than
being remembered afterwards.

#### Still to build from the mockups
Find a Guide's inline availability calendar and selector rows; Request Guide's
price breakdown; the guide profile's four tabs; the Plan screen's session
timeline and week row.

#### Blocked on the owner (with the brain)
1. The dated "Documents checked by ICEFALL" line — all three guide mockups.
2. ~~Zone 2~~ — resolved above.
3. "Luca will receive your request and reply" — a delivery promise; the enquiry
   table is still absent from the live database.
4. ~~IFMGA/UIAGM roundel~~ — **RULED: no.** Same trademark exposure as the four
   operator logos. Badge shape with a neutral ICEFALL mark.
5. ~~Demo guides shown as live~~ — **RULED: stay DEV-gated.**
6. The bottom nav becoming Plan · Train · Explore · Guides · Profile, which
   **removes START** — the app's one-tap route into recording.

## Company CRM  ·  `icefall-crm`
18 items — 8 buildable now, 8 waiting on design, 2 waiting on a decision

### `CR-01` Dashboard — **DONE 2026-08-31**

- **UNBLOCKED 2026-08-31 — the owner supplied a 1:1 mockup.** Rulings:
  - **The figures in it are ILLUSTRATIVE.** 24,850 users, €312,850 revenue and the
    percentage deltas are drawing material, not data. Build every tile on the real
    query layer. **This is not a request to reseed the database** — the owner reset
    it to real records deliberately, and their own hand-drawn "NOT BEING MEASURED
    YET" tile shows they expect honest states, not filled ones.
  - **Percentage deltas ("+12.4% vs prior week") need a prior period to compare
    against.** Where no snapshot exists, show the figure without a delta rather than
    computing one from nothing. A delta is a second claim, not decoration.
  - **Subscriptions revenue: honest absence.** No subscriptions table exists. Draw
    the segment as unavailable rather than zero — zero claims a measurement of none.
  - **Booking references (`#BK-1082`): do NOT invent a migration for a display
    format.** Show the real identifier, shortened. A human-readable reference is a
    product decision the owner has not made.
  - **THE SIDEBAR RESTRUCTURE IS NOT IN SCOPE.** Dashboard only. See below.

- **ESCALATED TO THE OWNER — the mockup's sidebar silently deletes eight built
  screens.** Gone from the nav: Sales Pipeline, Mountain Placements, **Slot
  Calculator**, Expeditions & Treks, Content Approvals, Leads, Invoices & Payments,
  Team, Verification, Tasks, Activity. Added with nothing behind them:
  Subscriptions, Reports.

  An AI drawing a dashboard does not know those screens exist, so their absence is
  an artefact of the prompt, not a decision. **Several are things the owner
  specifically asked for** — the Slot Calculator was commissioned and built this
  month, and Approvals, Leads and Placements all carry their own flight notes.
  Removing them from navigation would strand working screens. **Not inferred from
  one screen's margin.**
- **Design:** Complete full redesign . Dashboard should show:

1. Active Users
2. Total Users 
3. Total Guides
4. Total expedition companies
5. Map with user location

Under that straight revenue and where it comes from with the option to choose dates
- **Function:** We need  to add Map with user location

- Rebuilt 1:1 to the owner's 31 Aug mockup on the REAL query layer (`icefall-crm/src/screens/Dashboard.tsx`): live KPI counts (no deltas — no prior snapshot exists to compare against, per ruling), the owner's own "Not being measured yet" Active Users tile kept verbatim, Users by Country from real `profiles.country_code` (map space honestly awaits a licensed asset), revenue overview + breakdown from `revenue_records` with hand-rolled SVG charts, Subscriptions shown as honest absence, recent bookings/enquiries live, Top Markets with unlinked columns saying why, all times UTC with a real as-of stamp. Navigation untouched pending the owner's answer on the sidebar question.
### `CR-02` Analytics — **BUILD**
- **Design:** Numbers should be on the top, graphs underteeth
- **Function:** More data needed. Analytics needs every small pieace of data
- **CR-02a (layout) DONE 2026-08-31** — `icefall-crm/src/screens/Analytics.tsx`: six headline numbers now sit on top (Signups counted live, Enquiries, Bookings, Reported GMV, Recognised revenue, Companies), each a count/sum of real rows with a reason instead of a zero when the source is empty; the graph and table sections follow beneath.
- **CR-02b (the data set) PROPOSAL — awaiting the owner.** "Every small piece of data" needs sources; here is the set I propose, each with the question it answers and whether it is buildable today:
  - Signups per week (are we growing?) — buildable now from profiles.created_at.
  - Enquiries per mountain (where is demand?) — buildable now from leads.destination_id.
  - Lead funnel by stage over time (where do we lose people?) — buildable now from lead stage timestamps.
  - Revenue by stream per month (what actually pays?) — buildable now from revenue_records.
  - Deal pipeline value over time (is sales working?) — needs a snapshot job; deals hold only current state.
  - Listing views / search terms / CTR (what do people look at?) — NOT buildable: nothing emits view or search events anywhere in the family. Needs an events pipeline first (analytics_events exists and is empty). I will not draw these from anything less.
  Say which of these you want and I build exactly those.

### `CR-03` Companies — **DESIGN** · partial — design input needed
- **Function:** New expedition company page, buttons needs modernasation

### `CR-04` CompanyPage — **DESIGN** · partial — design input needed
- **Design:** Needs Chatgot for new look
- **Function:** When you click on a company page then you get all of their analytics on how much each mountain is generating, views active enquires EVERYTHING + if they need anything to be aproved

### `CR-05` Sales — **DONE**
- **Function:** Salespipeline should be able to drag a table from one side to the other
- **DONE 2026-08-31** — `icefall-crm/src/screens/Sales.tsx` + `moveDeal`/`createDeal` in `queries.ts`: cards drag between columns (optimistic, snaps back with the database's reason if refused; dropping into Lost pauses for the reason the CHECK demands). Add deal made real (company + title + optional value → Prospect) so the board can actually gain cards — the button existed and did nothing.

### `CR-06` MountainPlacements — **BUILD**
- **Function:** Now this design is good and layout. I need this connected to all the apps so website/app + phone/mobile app.

We also need mountain performance metrics so how many people search this up, enquire etc
- **CR-06a (metrics) DONE 2026-08-31** — `icefall-crm/src/screens/MountainPlacements.tsx`: a Performance strip under each mountain's hero — Enquiries counted from real lead rows for that destination; Searches stated as not measured (nothing in the family emits a search event) rather than drawn as 0.
- **CR-06b (connect the apps) FILED, not built here** — crossing into other apps per the shared rules: `icefall-sessions/requests/09-placements-to-phone-app.md` and `10-placements-to-web.md` — read live placements + the catalogue refresh feed, carry `real_business` through any Company mapping, §15 rendering rules restated.

### `CR-07` SlotCalculator — **DONE**
- **Function:** The total users need to be automatic since the cmr knows the active signups and users
- **DONE 2026-08-31** — `icefall-crm/src/screens/SlotCalculator.tsx` + `countAccounts` in `queries.ts`: prefilled live from the registered-account count, with the caption saying registered ≠ monthly-active (measured nowhere yet) and the field still editable for pricing hypotheticals.

### `CR-08` Products — **DONE 2026-08-31** · built 1:1 from the owner's mockup
- **Design:** Full page redesign, confusing + no use . Should also be a Ui where when you click on of it it shows you all analytics for it
- **Function:** When you click on the product, there needs to be full analytics so how many views , how much money generated, how much in comissions, how much in slots . EVERYTHING. How much each expedition company made etc

### `CR-09` Approvals — **DESIGN** · partial — design input needed
- **Design:** Complete page redesign

### `CR-10` Leads — **DONE 2026-08-31** (was DECISION; the owner's enquiry ruling settled D2)
- **Function:** Claude you need to suggest something for this page I dont know how it can help
- The page is now "who is waiting on us right now": `icefall-crm/src/components/EnquiryQueue.tsx` on the Leads screen — every enquiry from every app, longest wait first, unanswered first, with seen/answered worked inline and the lead records kept beneath. Wait time is shown because it is measured; no response time is promised anywhere. Database half: `20260831110000_enquiries.sql` (timestamps-not-status lifecycle, sender derived server-side, customer's words immutable, visitor path write-only, retention = super-admin delete with an audit trace; 17 new checks, 345 total). Awaits the owner's push; until then the queue shows the database's own error, deliberately not an empty list.

### `CR-11` Bookings — **DONE 2026-08-31** · built 1:1 from the owner's mockup
- **Design:** Bookings should split to guides, expedition mountains and expedition treks . Full redesign with acc mountain images and details for each booking and agreements

### `CR-12` Commissions — **DONE 2026-08-31** · built 1:1 from the owner's mockup
- **Design:** full page redesign
- **Function:** Usefull page but needs to be broken down, we need to know where the comission comes from

### `CR-13` Guides — **DONE**
- **Design:** Needs some adjusting so we know how many guides we have, how much comission was made by them and then a section where you have the applications to aprove or mountain they want to add all need aproval
- **Function:** Needs some adjusting so we know how many guides we have, how much comission was made by them and then a section where you have the applications to aprove or mountain they want to add all need aproval 

Once you click on a guide you must see their full profile + analytics and chats
- **DONE 2026-08-31** — `icefall-crm/src/screens/Guides.tsx` rebuilt on real `guide_profiles` + `GuideDetail.tsx` (new, `/admin/guides/:id`): count/listed/awaiting tiles, commission-generated sum from real guide-stream commissions (a reason, not €0, while none exist), and the approval queue — an unlisted profile IS the application, its mountains ARE the claims, and "Approve listing" calls the audited `set_guide_listed` with a required reason. Credentials stay pinned unverified until a person checks documents; the screen says so. Detail = profile (guide's own claims, labelled as such) + analytics (real counts) + their support threads, each opening the desk's conversation view.

### `CR-14` Support — **DONE**
- **Function:** Support must be cleaner. When we add staff to handle support we give them support for xyz people so either for guides, app users etc. + it HAS to be chats to click like all other chats
- **DONE 2026-08-31** — chats: the ticket list is now clickable thread rows (avatar, name, subject, latest-message snippet, status) opening the existing conversation view — `icefall-crm/src/screens/Support.tsx`. Scoping: `20260831100000_staff_support_scopes.sql` adds `staff_members.support_scopes` set ONLY through the audited `set_support_scopes` (super admin; 5 new DB checks — an early draft granted a direct write and was caught by the suite reopening a hole crm_fixes had closed); assigned on Admin Team ("Handles support for" column), and a scoped person's desk OPENS on their people — an assignment, not a read barrier. Requester kind stays server-derived, never client-sent.

### `CR-15` Verification — **DECISION** · paid vs credential badge — see D4
- **Design:** Full page redesign, should be option to veridy users, or guides, or sherpas etc

### `CR-16` Tasks — **DONE**
- **Design:** Task should work as a notification for someone so I can assign work to Jorge, he needs to se either and get it done etc
- **Function:** Task should work as a notification for someone so I can assign work to Jorge, he needs to se either and get it done etc
- **DONE 2026-08-31** — `icefall-crm/src/screens/Tasks.tsx` rebuilt + `createTask`/`assignTask`/`setTaskStatus` in `queries.ts` + a my-open-tasks count badge on the sidebar's Tasks entry (`Shell.tsx`). Create with a name on it, Mine tab, Take it / Start / Mark done (resolved_by + resolved_at recorded). The badge is the notification — in-app only, and the screen says nothing sends push or email.

### `CR-17` SOCIAL MEDIA PROMOTION — **DESIGN** · needs your design first
- **Design:** Needs a complete new ui
- **Function:** This is where we can promote a post or a story to certain people of our users that we want. So lets say elite exped we promote to 100 uk users 100 use users on heir feed or story, for how long etc 

Free users will also get to see like a pop up add for a guide which wants to spend money on ads or expedition company. It will be only in mountains they have in their goal list. Premiem members dont get these ads

### `CR-18` Billing — **DONE**
- **Function:** Notify sales team who needs to pay invoice or whos coming to an end of a slot deal
- **DONE 2026-08-31** — `icefall-crm/src/components/BillingChase.tsx` on the Billing screen + `notifyUnpaidInvoices` in `queries.ts`: a derived "Needs chasing" panel (overdue/past-due invoices; active placements ending ≤30 days or past term) with one button that raises real sales-desk tasks — idempotent per invoice via dedupe key, placements via the existing `raise_expiry_tasks`. With the Tasks sidebar badge (CR-16) that IS the notification; nothing pretends to send email.

## Operator CRM  ·  `icefall-operator`
9 items — 7 buildable now, 2 waiting on design, 0 waiting on a decision. Plus `OP-10`,
which is not a flight note but request 08 from the Company CRM session.

### `OP-01` CompanyProfile — **DONE** · session 04, 2026-08-31
- **Function:** Expedition companies can create posts for social media, and get followed by people which includes adding stories and creating promotional psots or videos
- **DONE** — `icefall-operator/src/screens/Posts.tsx` (the surface),
  `src/screens/CompanyProfile.tsx` (hosts it as the **Posts** tab — the owner's
  words are "company profile posts" and no operator mockup places it anywhere
  else), on the domain layer in `src/domain/types.ts`, `src/domain/adapter.ts`,
  `src/domain/memory/adapter.ts` + `memory/seed.ts`. Built via S2: the S2
  tables are NOT live, so everything runs against the in-memory adapter in the
  contract's exact shapes (`posts` with author kind / media / caption /
  optional expiry = a story; `post_comments`; `follows`) — the swap is a
  repoint, the route `leads.tags` took.
  - **Posts + stories:** the company's own feed, strictly chronological,
    newest first; composer with the contact-details guard on the caption
    (refusals verbatim), a "share as a story" toggle (24 h expiry derived from
    the app clock) that says what a story is, and the public-and-removable
    sentence. An expired story stays visible to the company as history,
    labelled no longer shown to climbers. A post removed by Icefall renders
    its reason verbatim and cannot be deleted over. No pending-review state —
    moderation is the CRM's queue (CR-17). Climbers' comments readable under
    each post; deletes confirm in a dialog.
  - **Followed by people:** follower count is `getFollowerCount` counting
    seeded `follows` rows — never a literal — framed as climbers following
    the company in the Icefall app. No reach, impressions or view counts
    anywhere, not even as dashes.
  - **Promotional videos — the decision-15 reconciliation:** decision 15
    (2026-08-29) removed `Company.video` and it STAYS removed; the OP-01
    wording is the LATER ruling and puts the promotional film on the SOCIAL
    surface, in its own S2-shaped store (`getPromoVideo`/`setPromoVideo`),
    reusing `VideoField`/`PromoPlayer` (click-gated youtube-nocookie). The
    mountain-film request (06) stays open, unchanged. This is not decision 15
    reversed.
  - **Media honesty:** no media store is connected — a dropped photo
    validates, previews and says plainly it is not saved and not attached;
    seeded posts reference the credited peak/trek libraries via the
    `ListingPhoto` pattern.

### `OP-02` Analytics — **DESIGN** · needs your design first
- **Design:** REDESIGN NEEDED FROM:

Expeditions
Treks
Mountains
Sources
Speed
Drop-off
Team
- **Function:** Should have to be able to select exact dates they want to see analytics from

### `OP-03` Mountains — **DONE** · session 04, 2026-08-31
- **Function:** So when a company requests to add a mountain, they should select mountain first and then send request to the company. Companies also should edit how many spots they have, there exact Itinerary . Difficulty should be already there since doesnt change + highest point they dont make sense. . Also make Edit page bigger to be seen and preview acc show how prev looks on the app or the web.
- **DONE** — `icefall-operator/src/screens/Mountains.tsx`,
  `src/screens/ProductEditor.tsx`, `src/editor/productSections.ts`,
  `src/screens/ProductDetail.tsx`, `src/domain/adapter.ts`,
  `src/domain/memory/adapter.ts`. All six halves of the note, in order:

  1. **Select first, then request.** "+ Add Mountain" used to send a request
     against NOTHING — neither the operator nor Icefall could say afterwards
     which peak had been asked for. It now opens on Icefall's own catalogue
     (`backend.getMountains()`) minus every mountain the company already holds a
     row for at any status (`useOperator().access`), with its own search; the
     operator picks one and only then can they send, and the button names the
     mountain it will request. The doctrine wording is unchanged — Icefall
     decides, a request grants nothing, access is separate from placement.
     **The confirmation no longer says "Request sent to Icefall", because that
     was false:** `OperatorBackend` has no mountain-access write of any kind, so
     nothing is transmitted and the screen now says so and points the operator at
     their Icefall contact. Filed as §2 of `requests/07-per-route-altitude.md`.
  2. **Spots — the direct-write half built.** The Departures inspector was
     read-only apart from one seats box. Each departure is now one card with the
     seam drawn down the middle of it: DATE and PRICE padlocked on top (they are
     advertised claims and go to Icefall), availability + **places on this
     departure** + **places left** below, saving immediately with no review, per
     constitution decision 12. `setDepartureAvailability` gained `spotsTotal` —
     it was already in `DEPARTURE_DIRECT_FIELDS` and had no way through the
     seam. Empty commits `null` ("not stated") and NEVER 0 ("none left"); a
     non-integer is refused out loud and the field reverts to the stored value,
     because the input renders what the BACKEND returned rather than what was
     typed. "9 left of 7 places" is saved as typed and called impossible on
     screen. Refusals surface through the existing `WriteResult` path.
  3. **Itinerary** — verified reachable and working (add/reorder/remove a day,
     live into the phone preview); the width fix in 5 is what it actually needed.
  4. **Difficulty and highest point — the seller can no longer state either.**
     Both inputs are gone from the Hero inspector, and gone from `Draft`, the
     parsed values, the contact-details scan and the closed payload allowlist —
     so there is no field left that could reach a submit. *Difficulty* is a
     property of the route, so it is read off the record and padlocked.
     *Highest point* is NOT taken from the mountain: where the record holds a
     figure it is shown padlocked, and where it holds none the editor says
     **"Not held by Icefall"** and states in words that the page shows nothing
     rather than the summit — naming the summit it is declining to borrow so
     nobody later reads the blank as an oversight. An EBC trek tops out at
     5,364 m against Everest's 8,849 m; substituting would overstate by 3,485 m,
     ~65% higher than the trip goes, in the one number a person uses to judge
     whether they can survive it. `ProductDetail.tsx` was the SECOND door into
     the same product and was still writing `difficulty` — closed the same way,
     because a rule enforced on one of two doors is not enforced. A stale
     pre-change draft payload still carrying either field is now named to the
     operator rather than riding a submit invisibly.
  5. **Bigger edit surface.** Inspector 340px → 400 / 500 (≥1280px) / 600
     (≥1536px); the preview gives way, since it is a 300px phone plus air.
     Checked at 1280 and 1440.
  6. **Preview** — App already shows the real thing and still does. Web's
     honest "this page cannot receive a draft yet" (request 05) is untouched and
     was re-verified, not regressed.
- **Filed:** `icefall-sessions/requests/07-per-route-altitude.md` — a per-route
  `max_altitude_m` on the mountain and trek records (nullable, never backfilled
  from the summit, NOT operator-writable at any grant), plus §2's
  `company_mountain_requests` table so the select-first flow has somewhere to
  send to. Both are schema and neither was assumed.
- **Not done, and deliberately not narrowed:** the highest point stays absent
  wherever the record is empty. That is correct-and-incomplete rather than
  wrong, and it is fixed by request 07 §1, not by this app.

### `OP-04` Treks — **SPLIT** into `OP-04a` (**DONE**) and `OP-04b` (**PROPOSED, with the schema owner**) by session 04, 2026-08-31

- **ANSWERED by the owner 2026-08-31: "Yes add them to also request a trek."**
  Treks get the SAME request mechanism as mountains. A company selects an existing
  trek from the catalogue and requests against it; it cannot invent one. This needs
  a `company_treks` equivalent to `company_mountains` — **a migration, so it is
  schema and must be written as one, not worked around in app code.**

  Carry the OP-03 rules across unchanged: the company edits only its own fields
  (spots, itinerary); **difficulty comes from the trek record**; and **highest point
  is NOT taken from any parent mountain's summit** — where there is no true
  per-route altitude, say there is none. An Everest Base Camp trek tops at 5,364 m
  against Everest's 8,849 m, and altitude is what a person uses to judge whether
  they can survive the trip.

  The 252 trek records live in `icefall-web`. Coordinate through
  `icefall-sessions/requests/`; do not reach into that tree.
- **Function:** So when a company requests to add a Trek, they should select Trek first and then send request to the company. Companies also should edit how many spots they have, there exact Itinerary . Difficulty should be already there since doesnt change + highest point they dont make sense. . Also make Edit page bigger to be seen and preview acc show how prev looks on the app or the web.
- **BLOCKED-pending-schema** — investigated, not built, nothing invented. Filed as
  `icefall-sessions/requests/08-company-treks.md`. `OP-03` works because a company
  requests access to a CATALOGUE ROW (`CompanyMountain`, `types.ts:193`, read by
  `getAccess`, gated by `canManageMountain`). **There is no trek equivalent of any
  part of that chain.** In this portal a trek is a `Product` the company authors
  (`ProductKind = "expedition" | "trek"`), `Product` has `mountainIds` and no
  `trekId`, and `NewProductInput` REQUIRES a `mountainId` — so a trek is authorised
  by mountain, and difficulty is free text the seller types. The 252-route
  catalogue is in ANOTHER app (`icefall-web/src/data/trekRecords.ts`), and its
  `operatorIds` is empty on all 252: `operatorsForTrek` is a hand-written region
  map over three invented companies, not a relation. **207 of the 252 treks have
  no mountain at all**, so 82% of the catalogue cannot be expressed here.
  Asked for: a readable trek catalogue, `company_treks` mirroring
  `company_mountains`, `products.trek_id`, and the request write path (which does
  not exist for mountains either — filed with `OP-03`).
  The trek record's `maxAltitudeM` — "highest point ON THE ROUTE" — is also the
  per-route altitude the safety finding in `TASKS-04-operator.md` point 3 needs.
  Still open, NOT blocked by this: bigger edit surface, real previews, spots and
  itinerary — those are `ProductEditor.tsx` and apply to trek products already.
- **That residual is now DONE** · session 04, 2026-08-31. `ProductEditor.tsx` is
  shared by both kinds, so everything closed under `OP-03` points 2–6 — spots,
  itinerary, the locked difficulty and highest point, the wider inspector and the
  previews — applies to a TREK product exactly as it does to an expedition, and
  was verified on `p-everest-base-camp-trek`. **What stays BLOCKED is only the
  first sentence of the note:** selecting a trek from a catalogue and requesting
  against it, which needs `company_treks` (`requests/08-company-treks.md`) and
  the request write path (`requests/07-per-route-altitude.md` §2). The trek
  record's per-route `maxAltitudeM` is asked for in request 07 §1.
- **Split, 2026-08-31.** The owner's answer arrived and the flow was built, but
  two different things were sitting under one heading: a mechanism in the app,
  and a table in a live database that is not this session's to create. Closing
  them together would have hidden whichever was not done.

### `OP-04a` Select a trek from the catalogue, then request it — **DONE** · session 04, 2026-08-31
- **Owner, answering:** "Yes add them to also request a trek."
- **Done in** `icefall-operator/src/screens/Treks.tsx`, with the chain behind it
  in `src/domain/types.ts`, `adapter.ts`, `memory/adapter.ts`, `memory/seed.ts`
  and `authz.ts`. It is the MOUNTAIN flow, mirrored, not a second mechanism:
  `Trek` (catalogue row) ↔ `Mountain`, `CompanyTrek` ↔ `CompanyMountain` (same
  five columns, permission and nothing else), `getTreks()` ↔ `getMountains()`,
  `getTrekAccess()` ↔ `getAccess()`, `canManageTrek` ↔ `canManageMountain`
  (active only), and "+ Request a trek" ↔ "+ Add Mountain".
- **Select first, then request.** The panel opens on Icefall's catalogue minus
  every route the company already holds a row for — at any status, so a
  suspended grant cannot be routed around by requesting it again. A company can
  never invent a route.
- **Nothing is claimed to have been sent.** There is no trek write on the seam,
  exactly as there is no mountain write, so the confirmation says the portal
  cannot deliver the request and names the route to send to the Icefall contact
  — the same two sentences `Mountains.tsx` says. `tests/authz.test.ts` asserts
  that no request path exists on the backend, and none was added.
- **The altitude rule is carried across intact.** Difficulty and the highest
  point are read from the ROUTE'S own record and shown rather than offered as
  fields. `highPoint()` in `Treks.tsx` takes a `Trek` and cannot reach a
  mountain, so the substitution is not merely forbidden but unreachable; where
  the catalogue has no per-route figure the screen says "Highest point not
  published". The source-scanning test that forbids taking a trip's high point
  from a peak's elevation still passes untouched.
- **Seed:** 19 real routes copied field for field from `icefall-web`'s 252-route
  catalogue. Lantern Ridge holds Everest Base Camp, Gokyo Lakes and Kilimanjaro
  Machame actively plus Everest Three Passes **suspended** (so "Editing paused"
  is real on screen); Coldharbour holds the Chilkoot Trail, so cross-company
  isolation is visible, not only tested.
- **Verified:** `npx tsc --noEmit` clean, `npm test` 113/113, and opened at
  http://localhost:5196/operator/treks as Ravi Thapa in BOTH themes — picked a
  route, sent the request, saw the confirmation.
- **One thing this did NOT do:** the button sits in the section header of a new
  "Trek routes assigned to you" block below the trip list, not inside the trip
  list's own toolbar. `ProductList.tsx` is shared with Expeditions and is another
  session's file this phase, so it was not edited to take an extra action. Moving
  the button into that toolbar is a one-prop change for whoever owns it next.

### `OP-04b` The live `treks` / `company_treks` schema — **PROPOSED, with the schema owner** · session 04, 2026-08-31
- **NOT DONE, and not this session's to do.** `OP-04a` works against the
  in-memory backend and a 19-route seed slice. **No trek table exists in the
  live database**, so nothing of this is real for a signed-in company yet.
- **Filed as** `icefall-sessions/requests/09-company-treks-migration.md` — the
  proposed SQL for `treks`, `trek_mountains` and `company_treks`, the
  `company_may_edit_trek` predicate, and the RLS posture copied from
  `company_mountains` (authenticated gets SELECT and no write of any kind).
  **It is a proposal for the schema owner to apply. Nothing was written under
  `icefall-supabase/`.** Request `08-company-treks.md` now points at it instead
  of carrying its own copy of the SQL.
- **Still open beyond the tables**, and asked for in that file: the request write
  path (one path covering both nouns, shared with `OP-03` and request 07 §2),
  `products.trek_id`, and a decision on the Everest Base Camp high point, which
  is 5,545 m in the web catalogue and 5,364 m in this portal's product seed.
- **When it lands:** point the two reads at the tables, delete the seed slice,
  and make `getTreks` / `getTrekAccess` required rather than optional members of
  `OperatorBackend`. They are optional only because `src/offline/backend.ts`
  implements the same seam and is frozen this phase; the screen already treats
  their absence as "the catalogue is not available here" rather than as an empty
  catalogue.

### `OP-05` Leads — **SPLIT** into `OP-05a`, `OP-05b` and `OP-05c` by session 04, 2026-08-31
The pieces are unrelated builds: one is the Leads screen's layout, the second is
a new offer-authoring feature shared with the guide app's `GU-03`, and the third
is the offer RECORD that feature deliberately does not have. Closing them
together would have hidden whichever was not done.

### `OP-05a` Leads layout and ready-made tags — **DONE** · session 04, 2026-08-31
- **Design:** Leads page on chats should remove the notes, and put then next to the right of ui interface + tags should be ready so cold lead, waste of time, intersetd, inquired etc
- **Done in** `icefall-operator/src/screens/Leads.tsx`. The screen is three
  columns now: lead list | conversation | a **Lead context** card holding the
  internal notes AND the tag editor. Nothing internal is left in the chat
  column. The four ready-made tags (Enquired, Interested, Cold lead, Waste of
  time — `PRIMARY_TAGS` in `components/leads.tsx`) sit under the tag editor as
  one-click chips that write straight through the backend; a chip already on the
  lead drops out of the row. Kept: the "your team only" wording, refusals shown
  verbatim, the contact-details guard on the composer, deep links, read-marking.
  The context column is the first thing to go when the window narrows — under
  the conversation below `xl`, stacked last below `lg` — never hidden, because
  hiding it would make the notes unreachable again.
- **Not touched:** `components/leads.tsx`. The tag vocabulary there is the
  contract and was imported, not re-spelled.

### `OP-05b` Custom offers — **DONE** · session 04, 2026-08-31
- **Function:** Also expedition companies can create custom offers via the app
- Same feature as the guide app's `GU-03`; the two must agree one shape.
- **Done in** `icefall-operator/src/money/offer.ts` (the arithmetic and the
  words), `icefall-operator/src/components/offer.tsx` (the composer dialog) and
  `icefall-operator/src/screens/Leads.tsx` (a **Custom offer** button on the
  thread header, against the selected lead). Tests: section 15 of
  `tests/authz.test.ts`, 10 checks.
- **One shape, not two.** It composes the shared `Quote`/`QuoteLine`/
  `Exclusion`/`CancellationPolicy` from `src/money/model.ts` — the same types
  the guide app's `GU-03` composes (request 07). No second offer type was
  defined. Amounts are entered in euros and stored as integer cents by `eur()`;
  a blank amount parses to **null, never 0**, and the total then states why
  there is no figure instead of quoting a trip as free.
- **AN OPERATOR'S OFFER HAS NO COMMISSION IN IT, AND THAT IS THE WHOLE POINT.**
  The guide app deducts `GUIDE_COMMISSION_PCT` because ICEFALL processes that
  payment; an expedition company is paid directly by the client and ICEFALL
  invoices the introduction separately, so nothing comes out of this offer.
  `operatorOfferTotals` calls `totalsFor(quote, 0)` — the shared line
  arithmetic, an explicit zero rate — and the screen shows no commission line,
  no deduction, and a "You receive" figure equal to the total. Per the brain
  (request 08): "The operator version never shows ICEFALL's commission. An
  operator sees what they receive; they do not see what we take." The reasoning
  is in comments at the totals and at the head of both files so it cannot be
  undone by someone copying the guide app.
- **The three things request 07 asked for.** (1) `passThrough` is a per-line
  toggle the seller sets, never inferred; it changes no figure here, and it is
  kept and asked for because it is the only record of which part of the total
  was the company's own fee rather than money it collected and handed on — what
  a referral is later worked out against. (2) The seller is shown what they
  receive in their own words, not only what the client pays. (3) `per` is
  explicit on every line and the party maths is spelled out — "€1,800 × 2 =
  €3,600" beside the line, and in the message the customer reads.
- **It actually sends, which the guide app cannot.** The offer goes into the
  conversation through `backend.sendMessage`, the same call the reply composer
  makes, so it passes the **same contact-details guard** as any other
  operator-authored text — verified in the browser: a phone number typed into a
  line label is refused and the refusal shows verbatim. Verified too that a
  properly composed offer does NOT false-positive: `formatDay`/`formatEur` keep
  raw ISO dates and long digit runs out of the body, which the guard's
  phone-number pattern would otherwise catch. Message bubbles now render
  `whitespace-pre-wrap`, without which a multi-line offer collapsed into one
  paragraph in the thread.
- **A lead with no ICEFALL thread.** Composition still works and the composer is
  never hidden; the Send is replaced by an honest statement that ICEFALL has no
  thread and cannot deliver it, worded differently for a lead the company added
  itself and for an ICEFALL enquiry recorded without a conversation — those are
  two different facts. Nothing fakes a send.
- **Also:** exclusions are required, or the seller must actively tick "nothing
  is excluded" (the `Exclusion` doc's rule); cancellation starts from
  `STANDARD_POLICY` with `FLEXIBLE_POLICY` as the alternative and an editable
  note; the dialog does NOT close on an outside click, unlike `AddLeadDialog`,
  because a half-composed price is too much work to lose to a stray click
  (Escape and Cancel still close it). Checked in BOTH themes.

### `OP-05c` Custom offers — no offer RECORD — **BUILD** · not started
Split out of `OP-05b` by session 04, 2026-08-31, rather than left implied.
`OP-05b` is genuinely complete as the owner worded it — a company can create a
custom offer and send it — and what follows is a second feature, not a missing
half of the first.
- The backend has no quote store, so an offer is composed and delivered as a
  MESSAGE and then lives in the thread like any other. There is no stored
  `Quote`, no offer status on the lead, no accept/decline, no expiry that does
  anything when the "holds until" date passes, and no way to reopen a sent offer
  and amend it. The composer says so plainly rather than implying a tracked
  document exists behind it.
- Doing it properly needs a schema decision (a quote table, its states, and who
  may see it), so it is not a screen-level change and was not invented here.

### `OP-06` Pipeline — **DONE** · session 04, 2026-08-31
- **Function:** Pipeline should work with the tags each customer -potencial client there is
- **Done in** `icefall-operator/src/screens/Pipeline.tsx`. A **Group by:
  Stage | Tag** control, not a replacement — stages and tags are two axes and a
  lead is in one stage but carries several tags, so collapsing them would lose
  one of them. Group by Tag gives one column per tag actually in use among the
  visible leads plus an **Untagged** column; a lead with two tags stands in both,
  and a line above the board says so, so the column counts are not read as a
  total. The card's ⋮ menu offers the verb its columns mean — stage moves under
  stage columns, add/remove tag under tag columns. A tag **filter** was added
  beside the existing origin and mountain filters (both kept), built from the
  tags the leads actually carry. In tag grouping each card carries a stage chip,
  so which stage a lead is in is never lost.

### `OP-07` Bookings — **DESIGN** · partial — design input needed
- **Design:** small redesign page, use chatgpt for it

### `OP-08` Team — **PARTIAL** · split into `OP-08a` and `OP-08b` by session 04, 2026-08-31
- **Function:** Super Admin should Have option to manage staff so give him more permissions like create offers etc . + male invote member work so when they get email they can create their account
- Two asks in one note, and they are not the same size. Split below. Do not close
  `OP-08` as a whole — close the halves.

### `OP-08a` Team — Super Admin and permissions — **DONE** · session 04, 2026-08-31
- **DONE** — `src/domain/authz.ts` + `src/screens/Team.tsx`.
  `CompanyRole` is STILL two values; no third was added. The top account is read
  off a fact the data already carries — `isOwnerAccount(user)` is
  `role === "admin" && invitedBy === null`, true for exactly the account Icefall
  created when the company joined (Ravi Thapa at Lantern Ridge). Added the
  permission the owner named — `PERMISSIONS.createOffers`, owner-only, plus a
  CLOSED `GRANTABLE_PERMISSIONS` list and a `grantedPermissions()` seam. It was
  deliberately NOT given to `isCompanyAdmin`: a custom offer is a price commitment,
  and adding it to what "admin" already means would widen every existing admin
  without anyone deciding it. All 102 tests still pass, including the four that
  assert a Sales employee is refused content work.
  Team.tsx: the founding account is labelled "Account owner" on its row, the Roles
  tab is three panels in prose — who can manage staff, what each tier can and
  cannot do — and refusals from `setTeamMemberStatus` are now SHOWN, not swallowed.
- **What is honestly NOT built, and says so on screen:** a grant cannot be stored
  (no column, no backend method), so the screen states that in words instead of
  offering a switch that would forget. Requested in
  `icefall-sessions/requests/11-operator-super-admin-and-grants.md`, which also
  reports a real hole: **any Company Admin can disable the founding account** —
  left unpatched on purpose, because a client-only guard would describe a rule the
  database does not hold. Two open questions for the product owner are in §5.3
  there: whether a Company Admin should hold `createOffers` by default, and note
  that `createOffers` has no caller until `OP-05`/`GU-03` build the offer builder.

### `OP-08b` Team — invite by email, they create an account — **BLOCKED** · no mail sender, no portal auth · honest half built, session 05, 2026-08-31

- **ANSWERED by the owner 2026-08-31:** *"Invite team member — once they add an
  email they get a sign up email and the person only needs to create password."*

  So: the inviter enters an email; ICEFALL sends an invitation; the invitee sets a
  password and is in. **They set a password and nothing else.**

  **Three constraints that follow from "only needs to create password", and they
  are security properties rather than polish:**
  - The invitation carries the identity — **company, role and permissions are fixed
    by the inviter**, never chosen or editable by the invitee. An invite flow that
    lets the recipient pick their own role is a privilege-escalation path.
  - The invite must be **single-use and expiring**, and bound to the address it was
    sent to. A forwarded link must not create an account for someone else.
  - **The invitee must not be able to change the email on the invitation** — that
    would let a leaked link be redirected.

  **Do not ship a Send that does not send** (the standing rule). Real email means
  Supabase auth email must actually be configured; its built-in sender is rate
  limited and not a production path. If it is not configured, the button reports
  that plainly and OP-08b stays open — it does not silently queue.
- **BLOCKED, not built, on purpose. TWO THINGS ARE MISSING, and each was verified
  this session rather than assumed:**
  1. **A configured mail sender.** `icefall-supabase/config.toml` is five lines —
     `project_id` and `[db] major_version` — with no `[auth.email.smtp]` block, and
     a search of that entire tree for smtp / sendgrid / resend / postmark / mailer /
     `inviteUserByEmail` returns nothing. There is no transport to hand a message to.
  2. **Authentication for this portal.** The operator app has no Supabase client and
     no auth of any kind; sign-in is `listSignInIdentities()`, a picker over seeded
     rows with no password field. Even if a mail went out there would be no account
     for the invitee to create and nowhere for a link to land. Spec §13 also says
     Icefall creates operator accounts, so self sign-up is itself a decision.
  An invite button that appears to send and sends nothing is the exact failure the
  constitution is written against, so no Send was shipped and nothing queues.
- **WHAT WAS BUILT — the honest half only** (`src/screens/Team.tsx`,
  `src/domain/adapter.ts`, `src/domain/memory/adapter.ts`; `tsc --noEmit` clean,
  113/113 tests pass, seen on :5196 as Ravi Thapa in **both** light and dark):
  - The word "sent" no longer appears anywhere on the screen, and no confirmation
    claims or implies a message went out. The panel's notice is now titled
    **"Icefall cannot email this person yet"** and says what actually happens: the
    person is recorded on the team list as Invited, nothing reaches them, and
    somebody at the company will have to tell them another way.
  - **The one plain sentence of what is missing, on screen:** "Two things are
    missing before an invitation can work on its own: an email service, and
    sign-in for this portal." The confirmation after adding, and the paragraph
    under the members table, both say the same thing in the same words.
  - **The three security properties from the owner's ruling are recorded as a
    comment at the invite call site** in `Team.tsx`, so whoever builds the real
    flow cannot lose them: (a) the invitation carries the identity — company, role
    and permissions fixed by the inviter, never chosen by the invitee, or it is
    privilege escalation wearing a friendly label; (b) single-use, expiring, and
    bound to the address it went to, so a forwarded link cannot create an account
    for someone else; (c) the invitee cannot change the email on the invitation, or
    a leaked link can be redirected. `OperatorBackend.inviteTeamMember` and the
    memory adapter now both carry a doc comment stating that the method writes a
    row and delivers nothing, and pointing at those properties.
  - Behaviour is unchanged: the write still goes through the backend, refusals are
    still shown, and no token, accept-invitation route or password screen was
    built — those are meaningless without auth and would be a second thing
    pretending to work.
- **What is left, for whoever unblocks it:** a configured transactional mail sender;
  authentication for this portal; then an invitation token with an expiry and a
  first-sign-in flow binding the new account to the existing `company_users` row.
  That is a project, not a column — scoped in §6 of
  `requests/11-operator-super-admin-and-grants.md`.

### `OP-09` Theme — **DONE** · session 04, 2026-08-31
- **Function:** Should be dark and white theme option
- **DONE** — `src/index.css`, new `src/state/theme.tsx`, `src/state/OperatorContext.tsx`,
  `src/screens/Settings.tsx`. Light stays the default (owner decision #18 is not
  reversed); Dark is now a choice, with a third option, System, that follows the
  operating system and keeps following it while the portal is open. The control
  is a labelled segmented radio group in **Settings → Account → Appearance**, and
  the choice is remembered in `localStorage` under `icefall-operator.theme` —
  every read and write wrapped, so a private window falls back to light instead
  of failing to boot. The theme is stamped on `<html>` at module import rather
  than in an effect, so a dark operator gets no white flash on reload.
- **How it is built:** one extra block of VALUES under the same token names
  (`--op-canvas` … the five states), recovered from `icefall-app/src/index.css`
  rather than invented. No token was renamed and none exists in only one theme.
  Two deviations, both noted at the line: dark `rejected` and `expired` keep the
  athlete app's hue but take a lighter lightness, because both are read as ~11px
  text here and the app's values are fills. Measured, every dark contrast ratio
  meets or beats its light counterpart (ink 16.1, muted 6.2, faint 3.1 vs 2.8,
  the five states 5.8–8.2, `text-canvas` on `bg-azure` 7.1).
- **One new token, in BOTH themes:** `--op-scrim` / `bg-scrim`. The dialog
  overlays were `bg-ink/30`, which was correct while `ink` was the only
  near-black in the file and inverts into a white veil once `ink` is near-white.
- **Checked in dark:** all 11 shelled screens plus the three full-bleed editors
  (CompanyEditor, ProductEditor, MountainEditor), sign-in, the trip preview and
  the delete dialog. A sweep for opaque light-ground elements across every
  shelled route returned nothing. The phone and web preview panes hold their own
  literal oklch values and stay dark in both themes, as intended — the Settings
  card says so rather than leaving it a surprise.
- **NOT FIXED, not my file:** `src/components/leads.tsx:329` — the Add-lead /
  lead dialog overlay is still `bg-ink/30` and renders as a pale wash over the
  page in dark. One-word fix: `bg-ink/30` → `bg-scrim`. Left for OP-05's owner.

### `OP-10` Product detail — the operator half of request 08 — **DONE** · session 04, 2026-08-31
- **Source:** not a flight note. Specified by the Company CRM session in
  `icefall-sessions/requests/08-operator-product-detail-from-03.md`, from the owner's
  Products mockup of 31 Aug. Recorded here so it is not re-derived from the drawing.
- **DONE** — new `icefall-operator/src/components/ProductOverview.tsx`, wired into
  `icefall-operator/src/screens/ProductDetail.tsx` behind an **Overview / Edit details**
  tab pair, with Overview opening first. Tests: `icefall-operator/tests/authz.test.ts`
  section 16 (5 new checks, suite green).
- **EXTENDED, NOT REPLACED, and here is why.** `ProductDetail.tsx` was never a detail
  screen — it is the trip's data editor (draft/submit through Icefall, plus the
  no-review departure availability writes). Replacing its body would have deleted a
  working write path to answer a read question. The performance detail is a second
  view of the same record at the same URL; nothing about save, submit or availability
  moved a line.
- **THE HARD DIFFERENCE, which is the whole reason the request exists:** the operator
  version shows **NO ICEFALL COMMISSION** — no commission tile, no company-earnings
  tile derived by subtracting one, no commission column, and `referralPctAtBooking` is
  not read. Absent, not hidden behind a role check. A test scans both files with
  comments stripped and fails on the word.
- **The owner's two sentences are reproduced VERBATIM** and asserted character-for-
  character by a test: the Views tile ("Not measured — We do not currently track
  views. This metric is not available.") and the closing banner ("ICEFALL does not
  currently record view counts, impressions or click-through data. We are focused on
  revenue, bookings and enquiries — the metrics that matter."). `demoListingViews`,
  which this app uses on its list screens, is deliberately NOT wired in here — on this
  screen the owner's words are the answer about views.
- **What it carries:** six tiles (bookings, revenue recorded, enquiries,
  enquiries→answered, placement agreed price, views), a bookings-and-enquiries line
  chart reusing the existing `TrendChart` rather than a second chart implementation,
  about-this-trip facts, the operator's own company card, and the placement/slot card.
- **ONE DELIBERATE RENAME, and it is not a narrowing.** The CRM's tile is "Placement
  income" because the money is Icefall's income. From this side of the same trade it
  is money the company PAYS, so the tile is **"Placement — agreed price"** with the
  footnote "What you have agreed to pay Icefall for this slot." Same stored
  `price_cents`; labelling a cost as income would be the same class of lie as
  inventing the figure.
- **Honesty:** placement `price_cents` NULL reads "price not yet agreed. Never free",
  never €0. Revenue counts confirmed and completed bookings only, sums reported values
  through `estimatedGmv` and states what it excluded; cancelled and unconfirmed
  bookings are counted separately in words. No deltas and no percentage changes
  anywhere — there is no snapshot table to compute them from. Real ids in the URL,
  no invented #BK/#PRD reference format. Placement stays unwriteable:
  `canEditPlacement()` is still false unconditionally and no placement write was added.
- **Seen** at http://localhost:5196/operator/products/p-everest-south-col as Ravi
  Thapa in BOTH themes, plus `p-everest-base-camp` (light) and the draft
  `p-kilimanjaro-machame` for the empty paths — no bookings, no enquiries, no
  placement, no chart, each saying why rather than showing a zero.

## Guide App  ·  `icefall-guide`
5 items, now 13 after splitting — **9 done**, 3 waiting on design, 0 waiting on a
migration. S3 (sign-in) done; S1/S2 queued behind the CRM's send function. GU-03c (the commission rate) is settled at 15%; D4's three marks are
built (GU-06a).

### `S3` Sign-in as the guide — **DONE** · 05 guide app, 2026-08-31

The auth mechanism was already built (`auth/account.ts`: `signInWithEmail`,
`signOut`, `onAuthChange`, and `guideAccess()` reading
`guide_profiles.id = auth.uid()`). **What S3 actually needed was the half nobody
had asked for**, found by checking what changed when a real person signs in:
**nothing did.**

- **`S3a` The session displaces the sample — DONE.** `src/domain/identity.ts`.
  Home and Profile read `ME`, the invented guide, **regardless of who was signed
  in** — so a real person signing in with their own ICEFALL account was greeted
  by somebody else's name and bookings. Nothing was edited to cause it: sign-in
  arrived, and screens written when there was no such thing as a session carried
  on reading the sample.
- **`S3b` The gold mark had two sources — DONE, and this was the serious half.**
  Verification reads the real server-derived `guide_credentials_state`; Home and
  Profile were deriving the same claim from the seed's approved application. **A
  signed-in guide ICEFALL had never checked would still have seen gold on their
  own home screen.** One source now: `showsCredentialMark()`, and for a real
  session that is the server's answer only. An UNREADABLE state never earns the
  mark — a claim made by a timeout is still a claim.

  Verified by forcing the branch and looking at it, then reverting: signed in as
  an `expired` guide, Home shows the real email, "Guide account", the expiry
  sentence — **and no gold mark**. No sample name, no sample bookings.

- **`S3c` The displacement audit — DONE, and it found twelve more readers.**
  `src/domain/sampleGate.ts`. S3a fixed Home and Profile because those were the
  two screens I happened to look at. The rule §6aj states is not "fix the screen
  you noticed" but **ask who reads this now** — so I listed every reader of the
  seed and found twelve screens with no session awareness at all. The result was
  visible in one scroll: **Home honestly said "your bookings are not connected to
  this account", and the very next tab showed six invented clients with names and
  dates.** Two answers to the same question, one tap apart.

  Fixed as **one gate, not twelve checks**. Twelve per-screen conditions is the
  disease that produced five commission models — each correct when written, drifting
  apart after. `sampleAllowed()` is the single answer; `sample(value, whenGated)`
  is the single way to ask. It **fails closed**: while the session is still
  unknown the sample does not render, because the honest state of "we do not yet
  know whose app this is" is not "here are six clients".

  The two `localStorage` stores were gated too. They looked like the guide's own
  work and therefore like the one thing that should survive — but they were
  **seeded from the sample**, so an ungated store would have quietly re-supplied
  the invented listing after the gate removed it. §6aj exactly: the hazard is
  what keeps doing the old thing.

  Two readers were found only by testing rather than by reading. `MyMountains`
  held its list in a `useState` initialiser — **a snapshot of revocable data**,
  correct until the moment the data may be withdrawn, which is §6aj in React
  shape. And the **tab bar's unread badge** was still promising six messages
  after every screen had been cleaned: a count is a reader too.

  Verified live on the app's own module instance, not a dynamically-imported
  copy — my first attempt tested a second copy of the module and proved nothing.
  With a session present: clients list gone, honest empty state in its place,
  badge cleared. Session removed: sample returns. Both directions, same tick.

  One stale sentence fell out of it: the empty state read "ICEFALL has no server
  connected", written before the client existed. There is a server; there is no
  message path. Corrected.

**Still correct-by-construction, not exercised:** there is no guide account to
sign in as, so the session path has never run against a real session. Bookings,
clients and earnings remain seed/local until S1 and the listing-sync migration;
the session screens say so plainly rather than showing an empty app as if it
were the account's real state.

### `GU-06` D4 badges + request 09 credentials model — **DONE** · 05 guide app, 2026-08-31

- **`GU-06a` The three marks — DONE.** `src/components/StatusBadge.tsx`, rendered
  on Home and Profile. **This app was showing the wrong one:** the tick beside the
  guide's name was AZURE and meant "documents checked", and under D4 azure is the
  PAID MEMBER mark — so it claimed a subscription with the sign for read papers.
  Nothing was edited to cause that; the ruling landed and an existing mark changed
  meaning underneath it. §6aa in a colour rather than a number.
  Gold now = credentials (a LINK to the verification screen, never a bare tick),
  small grey = identity, sourced separately via `identityVerified()` — two marks
  need two sources or they are one mark in two colours. **No blue variant built:**
  this app has no membership concept, so it would be a mark nothing can earn
  (§6c). Vocabulary recorded in the file instead. **No federation roundel.**
  Token is `--ice-credential`, holding the family's existing gilt VALUES so there
  is one gold in ICEFALL — but named for the claim, not for gilt, because gilt
  means "somebody is selling you this" (§6.10) and here it means the opposite.
  Verified in the browser: resolves to `oklch(0.7938 0.1274 84.5)`, distinct from
  azure, with `bg-gilt`/`bg-quokka` as negative controls.
- **`GU-06b` Request 09, the derived credentials model — DONE for this tree.**
  `credentials_verified` was dropped and replaced by
  `guide_credentials_state()` (`unchecked | checked | expired`).
  **Verified before acting: this app has NO runtime reference to that column** —
  only three comments — so `select=*` yielding `undefined` cannot bite here.
  Comments in `src/data/model.ts` corrected: the pin became a derived, named,
  expiring record. **The honest sentence survives with a new reason** — no longer
  "we cannot check" but *"we read the papers; the issuing association did not
  confirm them"* — and the file now says that the reason changed while the
  sentence did not, which is the trap.
- **`GU-06c` The status screen reading the derived field — DONE**, once the
  migration went live. `src/domain/credentials.ts` + a "What ICEFALL has
  recorded" panel at the top of `Verification.tsx`.

  **Verified live before building, not on the report.** `credentials_verified`
  now answers `42703 column does not exist`; `credentials_checked_at` and
  `state:guide_credentials_state` answer `42501 permission denied` — they exist
  and RLS refuses a signed-out caller. A nonsense column name returns 42703 as
  the control, which is the only thing that makes the distinction mean anything.

  **The state is TAKEN from the server, never computed here.** PostgREST derives
  it against `current_date`, so an expiry needs no client date arithmetic — the
  class that has cost this app four separate fixes (a UTC-midnight expiry, a
  countdown disagreeing with the date beside it, a badge disagreeing with the
  app's own lapse rule, and a parse that failed open). A value this app does not
  recognise is treated as UNREADABLE rather than collapsed into "unchecked": a
  fourth state quietly folded into a plausible one would hide a schema change.

  **A failed read is not "unchecked".** "We looked and nobody has checked you"
  and "we could not look" are different statements, and only one of them should
  be shown to a guide whose listing depends on the answer.

  Signed out it says so and **makes no request at all** — verified in a fresh
  tab: no console errors and no call to the database, because the read
  short-circuits before the network rather than earning a 401.

  The client-facing sentence keeps its second clause: *"Documents checked by
  ICEFALL on [date]. We have not contacted the issuing association."* Gold mark,
  no roundel. **Not verifiable end-to-end**: there is still no guide account to
  sign in as, so the record path is correct by construction and unexercised.

### `GU-01` Home — **SPLIT** · 05 guide app, 2026-08-31

- **`GU-01a` Function — DONE.** "Allow notification" for bookings and client
  messages. `src/lib/notifications.ts` + `src/components/NotificationOptIn.tsx`,
  placed on Home. Four states: unsupported / can-ask / granted / blocked-by-browser.
  **The permission request is real; ICEFALL still cannot send anything**, and the
  card says so beside the button rather than under it — no service worker exists
  in this app and no server pushes to anybody, both verified. Granting it now
  means notifications work the day a sender exists without asking again.
- **`GU-01b` Design — DESIGN, not done.** Complete redesign, upcoming booking,
  booking count. Waiting on the owner's drawing.
  **"Warnings are not needed now" belongs to this half and NO warning copy was
  removed** — several are honesty-doctrine text and removing them is D1.

### `GU-02` Analytics — **DONE** · 05 guide app, 2026-08-31
- **Design:** Good, just would like change top destination to top clientele and have images of the acc mountains or treks
- **Done:** "Top destinations" replaced by **Top clientele** — who the guide's work
  comes from, ranked by what reaches them net of commission, each row carrying the
  photograph of the mountain or trek that client is actually on.
  `domain/season.ts` (`topClientele`) + `screens/Analytics.tsx`.
  One honesty fix found by looking at it: a client whose only trip has no recorded
  value showed **€0**, which is a claim that they are worth nothing. It now reads
  "Not recorded" and the row states what it omits.

### `GU-03` Chat — **SPLIT** · 05 guide app, 2026-08-31
- **Function:** There should be an option where the guide can create a custom offer and offer it to the client based on his needs. iceFall still takes 15% commission

- **`GU-03a` Build the offer — DONE.** `src/screens/OfferComposer.tsx`, reached
  from a chat thread. Line items, per-person or whole-party, each markable as a
  cost the guide passes on. Live totals: what the client pays, what ICEFALL takes,
  what the guide receives, per climber. Arithmetic is `totalsFor` from the shared
  money model — never recomputed here (§6g). Re-verified in the browser AT 15%
  after the rate change: €900 × 2 → client €1,800, ICEFALL €270, guide €1,530;
  add a €240 hut marked pass-through → client €2,040, **ICEFALL still €270**,
  guide €1,770 (decision 13 — the commission is on the fee, not the total).
  *The figures first recorded here were €180 / €1,620, correct at 10% and stale
  the moment the rate moved. Recorded because a worked example in a document is
  the same stale-constant hazard as one in a comment.*
- **`GU-03b` Send it to the client — BLOCKED.** There is no message path in this
  app: no read, no write, no queue. The screen says so plainly instead of offering
  a Send that would keep the offer on the phone — a guide who believes a client
  has a price stops chasing it. Unblocks with the same work as the chat composers.

  **STILL BLOCKED — corrected 2026-08-31. The server half is WRITTEN, not live.**
  I read `icefall-supabase/migrations/20260831140000_messaging.sql` in the tree
  (`send_message`, `mark_thread_read`, offline idempotency on
  `(sender_id, client_id)`, sender's own receipt in the same transaction) and
  recorded it as landed. The brain probed the live database per §6ac with a
  control: `rpc/send_message` → 404 PGRST202 (does not exist);
  `rpc/open_enquiry`, same probe shape → 401 42501 (exists and refuses). **The
  file in the tree is not the migration in the database** — it awaits the
  owner's push, together with `20260831150000_enquiry_delivery.sql`. The offer
  screen's "cannot send" stays true; client wiring waits for the brain's GO,
  which will follow a live re-probe, not a file listing.

- **`S5` Consume the queued push — PLANNED and APPROVED; owner sequencing ruling
  2026-08-31: the push happens only after every page of the owner's review notes
  is completed, so this holds longer than first expected. Review-note items that
  name guide-app screens jump this queue when they arrive. Tree committed at
  `cd31ad5`.**

  **PRE-REGISTERED PREDICTIONS for the owner's first sign-in (written before
  the event, 2026-08-31, so the live run is judged against a record, not a
  memory). The CRM guide-profile action is live; when the owner clicks it and
  signs into this app I expect, in order:**
  1. `/welcome` accepts the credentials; a wrong password shows the friendly
     mapped sentence, never a raw Supabase message.
  2. The sample vanishes on the same tick everywhere — Home, Clients, Chat,
     both stores, the tab-bar badge (the S3c gate, first real exercise).
  3. Home greets with their real email, "Guide account", and the cold-start
     credential sentence: "ICEFALL has not checked your documents yet" —
     UNCHECKED shown honestly, not an error, not a spinner forever.
  4. NO gold mark and NO grey mark anywhere — no server record earns either.
  5. Clients/Chat/Analytics show the honest empty states ("not connected to
     this account yet"), not zeros pretending to be measurements.
  6. Sign-out returns the sample.
  **Watch-fors (the two I'm least sure of):** the gate's brief loading gap on a
  slow connection (fails closed — screen should be empty-not-sample, but I have
  never seen it on real network latency), and the `guide_profiles` row read in
  `guideAccess()` — if the CRM action writes a shape I didn't anticipate,
  access may resolve "not-a-guide" and show the wrong (but honest) notice.

  **PGRST201 standing check — run 2026-08-31, clean:** my client holds exactly
  two PostgREST reads (`account.ts` select("id"); `credentials.ts` plain column
  list + computed state), zero embeds of any table. Nothing for an ambiguous FK
  to break until messaging/identity wiring lands; re-run the grep then and name
  every FK in any profiles embed.

    **Prep done while holding:** the owner said yes to a guide profile on their own
  account (CRM builds the staff action; their sign-in is the session path's first
  real exercise). Walking that moment end-to-end found one dead end: from the
  sample state, sign-in was reachable only through the support line's small
  print. The sample-data notice on Home — the sentence that already says "this
  account is invented" — now carries "Sign in to see yours", verified rendering
  with `/welcome` reachable, email and password fields present. Six migrations ride one push; three are mine to consume, in this
  order, each behind the brain's live verification:
  1. **`20260831180000` guide_availability** — displaces `availabilityStore.ts`
     entirely (not merged: the store was seeded from the sample, §6aj). A row
     means the guide SPOKE; clearing is a DELETE; 'booked' derives from
     bookings and is never stored. Re-run the seeded-store reader check first.
  2. **`20260831160000` identity** — the grey mark's real source:
     `profiles?select=*,identity_verified`, computed never stored. The two
     readers are pre-marked in code (`Home.tsx` and `Profile.tsx`, at the
     session branches' `identity={false}`) so the displacement list for this
     push is already written where the change happens. Sample branches keep
     deriving from the sample; only the session branches bind.
  3. **`20260831140000` messaging + `20260831200000` offers** — GU-03b wiring
     (offer send + chat reply), via `send_message` with a stored `client_id`
     for offline idempotency, `mark_thread_read` on thread open. Reply-only
     per decision 19 — the compose affordance is already gone. The offers
     migration (landed in the queue 2026-08-31, `e2e1cf9`) settles the send
     shape: `quote` is **the money model's Quote verbatim as jsonb** — my
     screen's local Quote object IS the payload, nothing renormalised — with
     `seller_kind='guide'`, expiry derived from `valid_until`, amendment =
     new offer + `supersedes`, and commission structural through the one
     shared model (no second arithmetic; the title's "two models" is
     guide-deducts vs company-none). PGRST201 note for this step: `offers`
     carries TWO profiles FKs (`sender_id`, `recipient_id`) — any profiles
     embed from offers must name its FK from birth.

  **One thing the migration changed in this app before any wiring:** decision 19
  — a guide or operator may REPLY, never OPEN — is now enforced in the INSERT
  policy. `Chat.tsx` carried a disabled compose button, which read as *not built
  yet*. It is not unbuilt; it is ruled out. A greyed control promises a
  capability the platform has forbidden, and the obvious way to "finish" it is to
  request the grant that would break the rule. **Removed, with the reason written
  where the button was**, so it is not restored as a kindness. §6aj: the ruling
  landed, and the affordance quietly kept promising the opposite.

  The disabled chat-search icon went too — different reason, recorded as such:
  not forbidden, merely never built and in nobody's backlog. That one may come
  back. No disabled control remains anywhere in the app.
- **`GU-03c` The commission rate — ANSWERED AND DONE**, owner 2026-08-31:
  *"Make it 15% comission."* `GUIDE_COMMISSION_PCT` is 15 in
  `icefall-shared/money.ts` and synced. **No guide-app file was edited** — every
  surface reads the constant, so the rate moved and the screens followed.
  Re-verified in the browser at the new rate: €900 × 2 → client €1,800, ICEFALL
  €270, guide €1,530; with a €240 pass-through → client €2,040, ICEFALL still
  €270. Stale "10%" removed from this app's code comments in the same change.
  *Why it was asked rather than built:* the note said 15% while decision 3b had
  settled 10%. Had the guide app edited its own copy, the constant would have
  disagreed with five other apps until someone ran sync — and this app would have
  quoted a payout the athlete app contradicted for the same booking. A rate is
  not a screen-level fact.

### `GU-04` EditProfile — **DESIGN** · needs your design first
- **`GU-04a` The `+` button is glitched — DONE**, 05 guide app, 2026-08-31.
  TWO defects behind one report, both fixed in `components/ui/primitives.tsx`:
  (1) it rendered `<button><a>…</a></button>` — nested interactive elements,
  invalid HTML, and browsers disagree about which owns the click, so it worked
  sometimes and did nothing others. Navigation is now a prop, not a child.
  (2) it was positioned inside the scrolling list, so the guide had to scroll to
  the bottom of their mountains to reach "add one". It is now portalled into the
  phone frame and pinned clear of the tab bar. Verified in the browser: one
  element, no nesting, fixed while scrolling, and it navigates.
  **The redesign and the review/difficulty half of GU-04 are untouched.**
- **Design:** Eleven seasons on rock, snow and ice — mostly the Central Alps in summer and the Khumbu in autumn. Small parties, long ridges, early starts. (Sample profile: this guide is invented for the offline demo.)
Your listing not showing as you expect? Ask the ICEFALL desk
WHAT ICEFALL TELLS THE CLIENT
Documents checked by ICEFALL on 31 May 2026. We have not contacted the issuing association.


Section abve needs full redesign
- **Function:** Profile system needs change in way it works so for example guides cant just add any mountain, there has to be review + they dont decide how hard it is, since thats already a fact . Also the + button is glitched

### `GU-05` Profile — **DESIGN** · needs your design first
- **Design:** New ui needed for promotion page
- **Function:** Add Button "Promote" profile where there will be allowed to allocate a budget to target people who want to go on a trek or a mountain they want to climb, free users get these pop up ads

---

## Not covered

**The web app has zero notes.** Its marketplace and signed-in desktop app are
`import.meta.env.DEV`-only by design, so the static offline build could not show
them — only the waitlist page rendered. Roughly 30 screens still unreviewed.

### `WEB-AUDIT` every newly-reachable screen walked with empty data — **DONE 2026-08-31, Session 02**

The gate moved from `import.meta.env.DEV` to a real session, so ~30 screens now
ship to real users for the first time — all written assuming they only ever ran
in dev with demo data present. Walked all 22 `/app` routes against
`IS_DEMO = false` (production data conditions) and scanned the rendered text for
claims with nothing behind them.

**Result: the empty-data behaviour is honest throughout.** "No such guide —
ICEFALL has no guides listed yet", "No such company", "No such expedition",
"None yet", "0 conversations", "Nobody has posted". Zero unsupported claims
across ten patterns — ratings, review counts, success rates, response times,
scarcity, ranking badges, operational stats, bare-dash values.

**Two real defects found and FIXED:**

- `app/Coach.tsx` — the credits chip rendered its LABEL unconditionally and
  swapped only the figure for an em-dash, so a signed-in production user would
  read **"Coach credits · — available"**: a metered balance nothing in the
  codebase defines, in the bare-dash form the doctrine bans by name. Invisible
  while the chunk was dropped. The whole chip is now gated.
- `app/Explore.tsx` — the Mountains blurb said **"Fifty-one peaks"** while the
  same screen rendered **"52 peaks"** from the catalogue directly beneath it.
  Now derived from `PEAKS.length`, so the two cannot disagree again. Same defect
  as the commission comment that said 10% after the rate became 15%.

**The August-sweep targets are LATENT, not live, and the distinction matters.**
"24/7 support" and the unattributed refund line sit on company and trip pages,
which in production render "No such company" / "No such expedition" because
`COMPANIES` and `EXPEDITIONS` are empty. **They cannot reach a user today; they
go live the day real operators are onboarded** — a launch-blocker for operator
onboarding, not for auth. Do not close them.

**Left, low priority, not user-visible:** four comments still say "fifty-one
peaks" — `peakPlate.ts:141`, `MountainDetail.tsx:36`, `demo.ts:368`,
`tripDetail.ts:526`.

**Method, reusable:** temporarily set `IS_DEMO = false`, walk the routes headless,
scan rendered text against a pattern list, restore. It reproduces production data
conditions without needing an account — which is what makes the audit possible at
all, since nobody here can sign in.

**Why this had to be re-run rather than inherited:** the earlier "0 files in a
production build" evidence was true of a build where Rollup dropped the whole
chunk. Moving the gate made that evidence stale without touching a line it
covered. **Verification evidence expires when reachability changes.**

**RESOLVED 2026-08-31 by Session 02 — and it does NOT need a dev server.** The
cause was narrower than it looked: `import.meta.env.DEV` derives from `NODE_ENV`,
not from `--mode`, and `vite build` forces `NODE_ENV=production` regardless of
the mode passed. That is why `--mode development` was tried and failed.

    npm run build:offline --prefix icefall-web     # -> icefall-web/dist-offline/

Copy that into `ICEFALL-OFFLINE/apps/web/`. **The launcher needs no change** —
`serve.js` already falls back to `index.html` for SPA routes, so deep links like
`/app/company/…` resolve. Still one static bundle like the other four.

The guard is untouched: no second flag and no `||` in `App.tsx`. A plain
`vite build` was re-checked for four strings that exist only inside the gated
tree — `Solukhumbu Expeditions`, `data-icefall-section`, `Coach credits`,
`Elite Exped` — and all four are absent from a production build. Verified in a
browser: `/app`, company pages and deep routes all render, every request stays on
localhost.

**One screen still cannot be reviewed offline, by design:**
`/app/company/elite-exped` shows "No such company". Offline the site-wide "sample
data, not real" banner cannot honestly be applied to an identifiable real
business, so that record and its two listings are withheld. Rationale in
`icefall-web/OFFLINE-REVIEW-BUILD.md`.
