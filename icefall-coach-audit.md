# ICEFALL — onboarding and AI coach: what the code actually does

**Date:** 11 September 2026
**Commit:** `fc898e8 ICEFALL app: the world catalogue lands, and the review that should have run before it did`
**Status:** Sections 1–4 verified against source. Sections 5–6 (mountain/trek data,
proactive behaviour, paywall, cost controls) are **first-draft and NOT yet verified** —
the verification pass was stopped early on request. Treat anything in those two sections
as needing a second look before relying on it.

This is a factual audit. "Not implemented" means exactly that. Every claim carries a file
path. No secrets, keys or user data are reproduced.

---

### Verification pass — 2026-09-11

Independently re-checked against the source. `icefall-app/src/screens/Onboarding.tsx` was **not** modified during this audit (last written 2026-09-10 18:38), so the line-number drift found below was in the first draft rather than in the file. Summary:

- **RE-CONFIRMED, character by character:** the intro's 17-question subtitle; the Disciplines subtitle; the Equipment subtitle and its footer; the full Sex-assigned-at-birth subtitle (the longest quote in the section — it matches exactly); the Body-step subtitle and all three field notes; all 15 `SKILL_GROUPS` strings in their three groups; all 12 `EQUIPMENT` rows; all 4 `ALTITUDE_ILLNESS` rows with their notes; `LEVELS`, `LEVEL_TO_EXPERIENCE`, `TIMELINES`, `WEEK`, `SESSION_LENGTHS`, `LIMITATIONS`, `BASELINES`, `ALTITUDE_BANDS`, `GENDERS`, `SEXES` and `HEARD_ABOUT`.
- **RE-CONFIRMED by recount:** `ALL_QUESTION_STEPS` holds **17** entries; the `canAdvance` switch has a `case` for all **17**; exactly **two** conditional pushes; **27** distinct Supabase tables in `src`, of which `athlete_profiles` is reached from exactly **five** call sites.
- **RE-CONFIRMED:** the "Bodyweight only" exclusivity is **not implemented** — the whole equipment step (`:1970-2004`) contains a bare `toggle`; the six typed `athlete_profiles` columns are **written by nothing and read by nothing**; `gender` and `heard_about` are write-only; `updateCoachProfile` has exactly two call sites; there is **no edit screen** for any coach-profile answer.
- **RE-CONFIRMED and strengthened:** the height / year-of-birth copy ("Recorded only. Nothing in ICEFALL uses it yet.") is **false**. The full chain was traced: `Nutrition.tsx:644-645` → `dailyEnergyFor` → `fuelDay.ts:484-485` (which selects Mifflin-St Jeor *because* height and age are present) → `fuelDay.ts:428-430`.
- **CORRECTED — line numbers.** Roughly forty citations in this section were off by 1–5 lines. Every one I re-opened is corrected inline. The ones that mattered: the `canAdvance` switch is `:1502-1550` (each `case` one line later than cited); `finish()` is `:1081-1334` (the whole write-path subsection shifts by +1); the equipment toggle is `:1985`; `SUGGESTED_MOUNTAIN_IDS` is `:153`; `LEVEL_TO_EXPERIENCE` is `:146-151`; `MIN_WEEKS`/`MAX_WEEKS` are at `tracking/training.ts:28-29`, not `:165`; `buildPlanForGoal` is at `tracking/training.ts:169`, not `:160`; `/coach/nutrition` is `App.tsx:649`. **Treat every line number here as an anchor to search from, not as an address.**
- **RESOLVED (was uncertain) — the blanket reset exists.** Two live controls call `resetAll`: `/settings/manage` ("Delete everything" → "Delete account data" → "Erase", `screens/settings/Sections.tsx:3918-3953`) and a `Reset all local data` button on `screens/Profile.tsx:1245-1264`. See the rewritten paragraph below.
- **RESOLVED (was uncertain) — what the free readiness test can overwrite.** `coachProfilePatchFrom` (`growth/readinessTest.ts:475-493`) can change or erase exactly two onboarding answers: the `mountaineering` experience rung and `maxAltitudeM`. Nothing else.
- **RESOLVED (was uncertain) — the four curated goal suggestions.** All four ids (`mont-blanc`, `matterhorn`, `everest`, `mount-olympus`) exist among the 14 curated mountains, so all four render; none is silently dropped.
- **RESOLVED (was uncertain) — `/onboarding` is not linked from anywhere in the app.** The only five navigations to it are in auth screens.
- **STILL UNCERTAIN — OAuth providers.** Unchanged: the buttons render off a runtime call to the Supabase `/auth/v1/settings` endpoint, which is a server setting and cannot be read from this repository.
- **DATABASE — the standing caveat.** There are **69** migration files. **Whether any of them has been applied to the live Supabase project cannot be determined from the repository.** Every DB statement in this section describes a migration file, not a live schema.
- **ONE THING A REDESIGNER MUST CARRY OVER FROM SECTIONS 2 AND 3.** Several answers are described below as reaching "the coach prompt" or being "prompt only". In this build **the prompt is never sent** — `VITE_COACH_ENDPOINT` is unset and the model branch is eliminated from both compiled bundles. "Prompt only" therefore means **reaches nothing that runs**: limitations, the free-text limitations note, altitude illness, training baseline, training days and session length change no output the athlete can see today.

---

### Scope and method

All paths below are relative to `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main`. The app root is `icefall-app/`, migrations are in `icefall-supabase/migrations/`.

Everything in this section was read from executable code — the JSX that renders, the option arrays that feed it, the gate expressions, the write calls. Where a file's own comment claims something, I say whether the code agrees. Nothing here was run; no dev server, no git, no npm.

---

### The route order — what precedes the questionnaire

Routing is declared in `icefall-app/src/App.tsx`:

| Path | Component | Line |
|---|---|---|
| `/` | `Splash` (or `Navigate to="/home"` in DEMO builds that have onboarded) | `App.tsx:384-387` |
| `/welcome` | `Welcome` | `App.tsx:388` |
| `/auth/create` | `CreateAccount` | `App.tsx:389` |
| `/auth/signup` | `SignUp` | `App.tsx:390` |
| `/auth/signin` | `SignIn` | `App.tsx:391` |
| `/auth/handle` | `ChooseHandle` | `App.tsx:398` |
| `/auth/callback` | `AuthCallback` | `App.tsx:400` |
| `/onboarding` | `Onboarding` | `App.tsx:429` |
| `/connect` | `ConnectAccounts` | `App.tsx:411` |
| `/trial` | `TrialStart` | `App.tsx:412` |

The chain the code actually navigates, in order:

1. `Welcome` → `navigate("/auth/create")` (`auth/Auth.tsx:360`) or `navigate("/auth/signin")` (`auth/Auth.tsx:366`). There is no guest path — the comment at `auth/Auth.tsx:401-414` records that it was removed, and there is no such button in the JSX.
2. `CreateAccount` is `return <SignUp />;` — `auth/Auth.tsx:530-534`. It is not a separate screen.
3. `SignUp` submit → `navigate("/auth/handle", { replace: true })` at `auth/Auth.tsx:597`, unless `r.needsEmailConfirmation`, in which case it renders a "Check your email." interstitial and goes no further (`auth/Auth.tsx:590-594`, `599-616`).
4. `ChooseHandle` submit → `navigate("/onboarding", { replace: true })` at `auth/Handle.tsx:385`.
5. `Onboarding` payoff step → `navigate("/connect")` at `Onboarding.tsx:2551`.

`Callback.tsx` (the OAuth return) routes to `/auth/handle`, `/onboarding` or `/home` depending on `nextStepForSession()` — `auth/Callback.tsx:81`, `:85`, `:89`. It asks the athlete nothing.

`Trial.tsx` and `Connect.tsx` ask no questions. `Connect.tsx` is a device/service connection screen (Strava, Oura, watches) whose only inputs are provider buttons; it has no `StepHead`, no answer arrays, and its three `<h1>`s are at `Connect.tsx:623`, `:1077`, `:1540`.

---

### PART A — Account creation questions (before `/onboarding`)

#### A1. Sign-up form — `icefall-app/src/screens/auth/Auth.tsx:550-720`

Screen title (`Auth.tsx:619`): **"Create your account"**
Screen subtitle (`Auth.tsx:620`): **"Join ICEFALL and get access to personalised training plans, AI coaching and more."**
Progress indicator: `progress={{ step: 1, total: 2 }}` — `Auth.tsx:627`.

Three fields, all free text, all required. They are rendered by `Field` (`Auth.tsx:217-280`), which draws the label as an `sr-only` span and the same string as the visible placeholder (`Auth.tsx:243`, `:258`).

| # | Label / placeholder (verbatim) | Type | Required? How enforced |
|---|---|---|---|
| A1.1 | `Full name` | free text (`autoComplete="name"`) | Required. `ready` requires `name.trim().length > 1` — `Auth.tsx:567` |
| A1.2 | `Email address` | free text, `type="email"` | Required. `ready` requires `EMAIL_RE.test(email)` where `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` — `Auth.tsx:548`, `:567` |
| A1.3 | `Password` | free text, masked, with a show/hide toggle (`reveal`) | Required. `ready` requires `passwordOk = RULES.every(...)` — `Auth.tsx:566-567` |

The password rules are rendered as a live checklist (`Auth.tsx:647-670`) from `RULES` at `Auth.tsx:542-546`, verbatim:

- `At least 8 characters` — `test: (p) => p.length >= 8`
- `One number` — `test: (p) => /\d/.test(p)`
- `One special character` — `test: (p) => /[^\w\s]/.test(p)`

Enforcement is the Continue button's `disabled={!ready}` at `Auth.tsx:702`, plus an early `if (!ready) return;` in `submit()` at `Auth.tsx:570`. Button label: `Creating…` while busy, otherwise `Create account` (`Auth.tsx:703`).

Footer line (`Auth.tsx:628`, rendered by `AltLine` at `Auth.tsx:302-311`): text **"Already have an account?"**, link **"Sign in"** → `/auth/signin`.

Social provider buttons render **only** when `useEnabledProviders()` reports at least one key (`Auth.tsx:678-684`, and `SocialSignIn` returns `null` on an empty list at `Auth.tsx:463`). Labels, when drawn: `Continue with Apple` (`Auth.tsx:491`), `Continue with Google` (`Auth.tsx:499`), `Continue with Microsoft` (`Auth.tsx:507`). The comment at `Auth.tsx:466-482` states that on this project no provider is configured; that is a claim about a server setting and **cannot be verified from this repository** — the code merely asks the server and renders what comes back.

Email-confirmation interstitial, when the server requires confirmation (`Auth.tsx:598-617`):
- eyebrow `Almost there`
- title `Check your` / `email.`
- subtitle (template literal, `Auth.tsx:605`): **"We sent a link to {email}. Open it on this device and you'll pick your username next."**
- note (`Auth.tsx:609-612`): **"The link proves the address is yours. Until it's opened the account can't be used — that's what stops somebody signing up as you."**

#### A2. Sign-in form — `Auth.tsx:724+` (not part of signup, listed for completeness)

Title **"Welcome back"**, subtitle **"Sign in to continue your journey."** — `Auth.tsx:795-796`. Fields: email, password, and a remember-me control. Not a questionnaire.

#### A3. Handle screen — `icefall-app/src/screens/auth/Handle.tsx:323-462`

Progress: `progress={{ step: 2, total: 2 }}` — `Handle.tsx:392`.
Title (`Handle.tsx:394`): **"Pick your"** / **"name on the mountain."**
Subtitle (`Handle.tsx:395`): **"Your username is how other climbers find you. It can't be changed often, so choose one you'll want."**

| # | Label | Placeholder | Type | Required? |
|---|---|---|---|---|
| A3.1 | `Username` | `chris.climbs` | free text; every keystroke passes through `normalise()` (trim + lowercase) — `Handle.tsx:414`, `auth/username.ts:102-104` | **Required.** `ready = !problem && !busy && avail.state !== "taken" && avail.state !== "reserved"` — `Handle.tsx:388`; button `disabled={!ready}` at `Handle.tsx:452` |
| A3.2 | `Town or region` | `Chamonix` | free text (`autoComplete="address-level2"`) | Optional — it appears in no gate |
| A3.3 | `Country` | `Prefer not to say` | single select, filterable `Listbox` — `Handle.tsx:437-448` | Optional. `{ value: "", label: "Prefer not to say" }` is the first option and the default (`Handle.tsx:444`) |

Country options: the literal `"Prefer not to say"` row plus **258** entries from `COUNTRIES` (`Handle.tsx:62-321`; counted 258 `{ code: "` lines). The comment at `Handle.tsx:50-52` claims 258 — that matches. Each option's label is the English country name, e.g. `Afghanistan`, `Åland Islands`, `United Kingdom`, `Unknown Region`, `Zimbabwe`.

Username validation, from `icefall-app/src/auth/username.ts:74-91`. One message at a time, in this order:

| Condition | Message shown, verbatim |
|---|---|
| empty | `Pick a username.` |
| `< 3` chars | `At least 3 characters.` (template: `` `At least ${USERNAME_MIN} characters.` ``, `USERNAME_MIN = 3`) |
| `> 20` chars | `At most 20 characters.` (`USERNAME_MAX = 20`) |
| `/[^a-z0-9_.]/` | `Letters, numbers, underscore and full stop only.` |
| `/\.\./` | `No two full stops in a row.` |
| fails `SHAPE` = `/^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/` | `Start and end with a letter or number.` |

Availability is checked against the server on a 350 ms debounce with a sequence guard (`Handle.tsx:339-351`).

Footer control (`Handle.tsx:397-408`): a **"Sign out"** button that calls `signOut()` then `navigate("/welcome")`.

Closing note (`Handle.tsx:456-460`), verbatim: **"A town or region only — ICEFALL has no field for an address, and this is never turned into a map position. Leave the country blank if you'd rather not say; nothing on the app depends on it."**

Submit writes: `claimUsername(username)` (`Handle.tsx:358`), then — only if `town.trim() || country` — `setMyLocation(town, country || null)` (`Handle.tsx:381`). The location write is deliberately allowed to fail silently (comment `Handle.tsx:378-380`; the code does not check its result).

---

### PART B — The onboarding questionnaire, `icefall-app/src/screens/Onboarding.tsx`

#### B0. The step machine

`StepKey` union: `Onboarding.tsx:856-877`.
`ALL_QUESTION_STEPS`: `Onboarding.tsx:892-910` — exactly **17** entries (recounted in the verification pass: 17 string literals on `:893-909`): `disciplines, experience, goal, timeline, days, length, equipment, skills, altitude, altitudeIllness, baseline, limitations, gender, sexAtBirth, body, heardAbout, name`.

The live sequence is computed at `Onboarding.tsx:1013-1061`:

```
const s: StepKey[] = ["intro", "disciplines"];
if (disciplines.length > 0) s.push("experience");
s.push("goal");
if (goalPeak) s.push("timeline");
s.push("days","length","equipment","skills","altitude","altitudeIllness",
       "baseline","limitations","gender","sexAtBirth","body","heardAbout",
       "name","building","payoff");
```

The counter in the header reads `${questionNumber} OF ${questions.length}` (`Onboarding.tsx:1601`), where `questions` filters out `intro`, `building` and `payoff` (`Onboarding.tsx:1066-1068`). So the live denominator is **17** with both conditionals present, **16** with one, **15** with neither.

Advance: `next()` at `Onboarding.tsx:1552-1556` — `if (!canAdvance) return;` then `if (step === "name") finish();` then increment. The primary button carries `disabled={!canAdvance}` at `Onboarding.tsx:2556`. *(Verification pass: the `canAdvance` switch itself is `Onboarding.tsx:1502-1550`, one line later than every `case` citation below; `if (step === "name") finish();` is `:1554`.)* Its label is `Begin` on intro, `Build my plan` on the name step, `Continue` otherwise (`Onboarding.tsx:2557`).

Back: a left-arrow button, rendered only when `index > 0 && step !== "payoff" && step !== "building"` (`Onboarding.tsx:1564`).

#### B-intro. Intro screen (not counted as a question)

`IntroStep`, `Onboarding.tsx:2570-2608`. Rendered at `Onboarding.tsx:1623` as `<IntroStep count={ALL_QUESTION_STEPS.length} />`.

- eyebrow: `Personalisation`
- title: `Let's build` / `your mountain.`
- subtitle (`Onboarding.tsx:2582`, a template literal — the leading number is `count`), verbatim as it renders (re-checked character by character):

  **"17 questions at most — a couple drop out if they don't apply to you. About a minute. Every one is answerable: where a truthful answer is "none" or "prefer not to say", that is offered as a real option. They change which movements your sessions prescribe, how fast ICEFALL is willing to suggest you go up, and what it will train around."**

- three list rows (`Onboarding.tsx:2586-2593`), verbatim:
  - `Your objective` — `Sets the target date the whole plan is built backwards from.`
  - `Your equipment` — `Decides which exercises can appear in a session at all.`
  - `Your skills and altitude` — `The two things ICEFALL cannot observe, and will not guess.`
- disclaimer (`Onboarding.tsx:2601-2605`): **"Where an answer does not yet change anything, the summary at the end says so rather than implying otherwise. ICEFALL is a training tool, not medical advice, and it defers to a certified guide on anything glaciated, technical or high."**

**Verification of the "17 questions at most" claim: ACCURATE, on both halves — and independently re-checked.** The number is not hardcoded — it is `ALL_QUESTION_STEPS.length` (`Onboarding.tsx:1623`), and that array has exactly 17 entries (`Onboarding.tsx:892-910`). Exactly two steps are conditional (`experience` at `Onboarding.tsx:1015`, `timeline` at `:1017`), so "a couple drop out" is exact, and the floor is 15. Re-verified in the verification pass: those are the only two `if` statements in the whole `useMemo`.

---

#### B1. Disciplines — `Onboarding.tsx:1625-1691`

- eyebrow: `Disciplines`
- title: `What do you` / `actually do?`
- subtitle: **"Choose everything that applies. This decides which experience questions ICEFALL asks you next, and those go to the readiness assessment as context."**

**Type: multi select** (grid of tiles, `toggle()` at `Onboarding.tsx:1071`), plus one mutually-exclusive "none" tile.

Options (`DISCIPLINES`, `Onboarding.tsx:121-130`), in render order:

1. `Hiking`
2. `Trail running`
3. `Mountaineering`
4. `Climbing`
5. `Ski touring`
6. `Mountain biking`
7. `Alpine skiing`
8. `Something else`

Then a full-width tile (`Onboarding.tsx:1666-1690`):
- `None of these yet`
- helper: **"A real answer, recorded as such. ICEFALL skips the experience question — a question it declined to ask, not one you skipped — and never invents a discipline for you."**

Mutual exclusion is real and two-way: tapping a discipline runs `setNoneDisciplines(false)` (`Onboarding.tsx:1638`); tapping the none tile runs `setDisciplines([])` (`Onboarding.tsx:1670`). Deselecting a discipline also deletes its experience level (`Onboarding.tsx:1643-1649`).

**Required.** Gate: `case "disciplines": return disciplines.length > 0 || noneDisciplines;` — `Onboarding.tsx:1503-1504`.

**Branching (quoted):** `if (disciplines.length > 0) s.push("experience");` — `Onboarding.tsx:1017`. Choosing "None of these yet" (or deselecting everything) removes step B2 from the flow entirely.

Note on the mapping: only six of the eight ids carry a `discipline` field on the app's `Discipline` union (`Onboarding.tsx:122-129`). `mountain-biking`, `alpine-skiing` and `other` have none, and are filtered out of `answers.disciplines` at `Onboarding.tsx:1219-1221`. They **do** survive in `disciplineExperience`, which is keyed by the free-form id (`Onboarding.tsx:1090`).

#### B2. Experience — `Onboarding.tsx:1692-1732` (conditional)

- eyebrow: `Experience`
- title: `How far in are you?`
- subtitle: **"One answer per discipline. ICEFALL records these as your own words and never scores them — a claim is a claim, and it will say so."**

**Type: one single-select row per selected discipline**, four buttons each (`Onboarding.tsx:1707-1723`). Options (`LEVELS`, `Onboarding.tsx:96-101`): `Beginner`, `Intermediate`, `Advanced`, `Expert`. No "prefer not to say", no "none".

**Required, for every selected discipline.** Gate: `case "experience": return disciplines.every((id) => levels[id] !== undefined);` — `Onboarding.tsx:1505-1506`.

The strongest level across disciplines becomes the single `experience` value (`Onboarding.tsx:1171-1173`), mapped by `LEVEL_TO_EXPERIENCE` (`Onboarding.tsx:146-151`): `beginner→"new"`, `intermediate→"developing"`, `advanced→"experienced"`, `expert→"advanced"`.

#### B3. Goal / objective — `Onboarding.tsx:1734-1822`

- eyebrow: `Next goal`
- title: `What are you building towards?`
- subtitle: **"The objective and its date are what the whole training plan is generated backwards from."**

**Type: single select from a curated list, OR a live peak search, OR a "no objective" tile.**

Curated suggestions come from `SUGGESTED_MOUNTAIN_IDS = ["mont-blanc", "matterhorn", "everest", "mount-olympus"]` (`Onboarding.tsx:153`) resolved through `sync.mountainById` (`Onboarding.tsx:156-172`); any id that no longer resolves is dropped (`Onboarding.tsx:160`). So the labels are data-driven, not literals in this file.

**Resolved in the verification pass:** `sync.mountainById` is `mountainById` from `@/data/mock/mountains` (`services/repository.ts:3`, `:68`), and all four ids are present among the 14 curated mountains. **All four suggestions render: Mont Blanc, Matterhorn, Everest, Mount Olympus.** None is dropped.

Search (`PeakSearch`, `Onboarding.tsx:760-865`):
- input placeholder: `Search any peak on earth` (`Onboarding.tsx:790`)
- screen-reader label: `Search for a mountain` (`Onboarding.tsx:783`)
- section label above it: `Or find your own` (`Onboarding.tsx:1809`)
- 550 ms debounce, minimum 2 characters, max 8 results (`Onboarding.tsx:773`, `:781`, `:786`)
- empty-result copy (`Onboarding.tsx:844-848`): **"Nothing found. Search runs against OpenStreetMap and needs a connection; peaks without a recorded elevation are left out, because elevation is what every assessment is derived from."**
- attribution line renders `PEAK_ATTRIBUTION` from `@/services/peaks` (`Onboarding.tsx:851`)

The decline tile (`Onboarding.tsx:1802-1819`):
- `I don't have one yet`
- helper: **"A perfectly good answer, and nothing is withheld for it. ICEFALL simply won't invent a summit to point you at."**

**Required.** Gate: `case "goal": return Boolean(goalPeak) || noGoal;` — `Onboarding.tsx:1507-1508`.

**Branching (quoted):** `if (goalPeak) s.push("timeline");` — `Onboarding.tsx:1017`. Picking any peak adds B4; "I don't have one yet" (or clearing the peak) removes it.

#### B4. Timeline — `Onboarding.tsx:1824-1883` (conditional; rendered only when `step === "timeline" && goalPeak`)

- eyebrow: `Timeline`
- title: `When do you want` / `to be standing on it?`
- subtitle (template, `Onboarding.tsx:1829`): **"The plan for {peak name} is built backwards from this date — how many weeks it runs, and where Base, Build, Peak and Taper fall."**

**Type: single select of four presets, plus an optional date picker that overrides them.**

Presets (`TIMELINES`, `Onboarding.tsx:174-181`):

| Label | months |
|---|---|
| `Within 6 months` | 6 |
| `Within a year` | 12 |
| `Within two years` | 24 |
| `Not sure yet` | 12, flagged `assumed: true` |

`Not sure yet` carries a detail line, but **only while no custom date is set** — condition at `Onboarding.tsx:1841-1843`: `t.assumed && !customDate`. Its text: **"ICEFALL will assume twelve months so a plan can exist, and will say so"**.

The date control appears only once something is chosen — `{(timelineId !== null || customDate) && (` at `Onboarding.tsx:1866`. It is a custom calendar popover (`DateField`, `icefall-app/src/components/ui/DateField.tsx:41-60`) with:
- accessible label `Target date` (`Onboarding.tsx:1872`)
- `min={isoDayKey(new Date())}` — today (`Onboarding.tsx:1874`). **No `max` is passed**, so there is no upper bound on the target date.
- section label above it: `Your date` when a custom date is set, otherwise `Which works out as` (`Onboarding.tsx:1868`)
- below it, a computed line (`Onboarding.tsx:1878-1881`): `{n} weeks from today.` plus ` The shortest plan ICEFALL will build.` at exactly 8 and ` The longest plan ICEFALL will build.` at exactly 52.

`resolvedWeeks` clamps to 8–52 (`Onboarding.tsx:1473-1478`), which matches `MIN_WEEKS = 8` / `MAX_WEEKS = 52` at `icefall-app/src/tracking/training.ts:28-29` (corrected — the first draft cited `:165`, which is inside `demandFor`).

**Required.** Gate: `case "timeline": return timelineId !== null || customDate !== "";` — `Onboarding.tsx:1509-1510`.

Picking a preset clears any custom date (`Onboarding.tsx:1849`). Picking a date does **not** clear `timelineId`; the preset simply stops rendering as selected because the check is `!customDate && timelineId === t.id` (`Onboarding.tsx:1845`).

#### B5. Training days — `Onboarding.tsx:1885-1940`

- eyebrow: `Training days`
- title: `Which days are yours?`
- subtitle: **"The days you can normally train, saved to your profile."**

**Type: multi select**, seven buttons, Monday first (`WEEK`, `Onboarding.tsx:184-192`). Visible labels: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`; `aria-label`s are the full names `Monday` … `Sunday` (`Onboarding.tsx:1904`). Stored as JS day indices with `0 = Sunday`.

Plus a mutually-exclusive tile (`Onboarding.tsx:1918-1939`):
- `No fixed days — it varies`
- helper: **"Recorded on your profile as its own answer. Either way, the generated week is currently a fixed six sessions and one rest day — ICEFALL does not yet move sessions onto the days you pick."**

**Required.** Gate: `case "days": return days.length > 0 || noFixedDays;` — `Onboarding.tsx:1511-1512`.

#### B6. Session length — `Onboarding.tsx:1942-1966`

- eyebrow: `Session length`
- title: `How long is a normal session?`
- subtitle: **"Roughly, on a day you are not doing something long in the mountains."**

**Type: single select**, five rows from `SESSION_LENGTHS = [30, 45, 60, 90, 120]` (`Onboarding.tsx:214`). Labels are generated at `Onboarding.tsx:1951`: `30 minutes`, `45 minutes`, `60 minutes`, `90 minutes`, and — for the last — `120 minutes or more`.

No default is preselected (`sessionMin` starts `null`, `Onboarding.tsx:957`). If the step is somehow bypassed, `finish()` writes `60` (`Onboarding.tsx:1094`).

**Required.** Gate: `case "length": return sessionMin !== null;` — `Onboarding.tsx:1513-1514`.

Footer note (`Onboarding.tsx:1958-1963`): **"Recorded on your profile. Sessions are still prescribed at the length the plan sets for that kind of day — ICEFALL does not yet cut them to this number. When one does not fit, the session screen will rebuild it around the time you actually have."**

#### B7. Equipment — `Onboarding.tsx:1970-2004`

- eyebrow: `Equipment`
- title: `What can you train with?`
- subtitle: **"This one changes your sessions directly: ICEFALL will not prescribe a movement that needs kit you don't have."**

**Type: multi select**, 12 tiles (`EQUIPMENT`, `Onboarding.tsx:270-283`):

| Label | Note |
|---|---|
| `Bodyweight only` | `No kit at all` |
| `Dumbbells` | — |
| `Barbell` | — |
| `Kettlebell` | — |
| `Pull-up bar` | — |
| `Bench` | — |
| `Step or box` | — |
| `Resistance band` | — |
| `Treadmill` | — |
| `Stairs` | — |
| `Weighted pack` | — |
| `Hangboard` | — |

**No "none of these" tile and no mutual exclusion.** The handler is a bare `setEquipment((s) => toggle(s, e.id))` (`Onboarding.tsx:1985`), so `Bodyweight only` can be selected together with `Barbell`. The comment at `Onboarding.tsx:1517-1518` states the design intent ("Bodyweight only" is the answer that stands for none), and the gate agrees, but nothing prevents the contradictory combination. **Re-verified in the verification pass by reading the whole step (`Onboarding.tsx:1970-2004`): there is no exclusivity code anywhere in it.**

**Required.** Gate: `case "equipment": return equipment.length > 0;` — `Onboarding.tsx:1516-1519`.

Footer note (`Onboarding.tsx:1997-2002`): **"Choosing nothing is different from choosing "bodyweight only". Nothing means you have not told ICEFALL, so sessions are built as normal with a note that they assume the movements are available. "Bodyweight only" is a statement, and sessions are then built without equipment at all."**

#### B8. Technical skills — `Onboarding.tsx:2004-2078`

- eyebrow: `Technical skills`
- title: `What have you been taught?`
- subtitle: **"Only competences ICEFALL can check an objective against are listed. Nothing here is verified — it is your word, and every screen that uses it says so."**

**Type: multi select**, 15 checkboxes in three labelled groups (`SKILL_GROUPS`, `Onboarding.tsx:295-326`). Verbatim, and re-checked character by character in the verification pass:

**`Hill and scrambling ground`**
- `Navigation in poor visibility`
- `Grade I–II scrambling`
- `Comfort with exposure`
- `Rockfall awareness`

**`Snow, ice and glacier`**
- `Crampon and ice-axe technique`
- `Self-arrest on steep snow`
- `Roped glacier travel`
- `Crevasse rescue`
- `Efficient rope work on mixed ground`
- `Reading snow and serac hazard`

**`Altitude and expedition`**
- `Staged acclimatisation`
- `Recognising acute mountain sickness`
- `Cold-injury prevention`
- `Fixed-line ascent and descent`
- `Supplementary oxygen systems`

Plus a mutually-exclusive tile (`Onboarding.tsx:2049-2068`): `None of these yet` — no helper text on the tile itself.

**Required.** Gate: `case "skills": return skills.length > 0 || noSkills;` — `Onboarding.tsx:1519-1520`.

Footer note (`Onboarding.tsx:2070-2075`): **"None of these yet is a normal place to be, and it is the honest answer if you have not been taught them. ICEFALL then withholds a technical readiness score rather than guessing one. These are learned in person from a qualified instructor, never from an app."**

#### B9. Highest altitude — `Onboarding.tsx:2080-2103`

- eyebrow: `Altitude`
- title: `How high have you been?`
- subtitle: **"The highest you have actually stood, on any trip. This becomes the floor ICEFALL reasons from — it will never assume one."**

**Type: single select**, five bands (`ALTITUDE_BANDS`, `Onboarding.tsx:335-341`), stored as the lower bound in metres:

| Label | stored `lowerM` |
|---|---|
| `Under 1,000 m` | 0 |
| `1,000 – 3,000 m` | 1000 |
| `3,000 – 4,500 m` | 3000 |
| `4,500 – 6,000 m` | 4500 |
| `Above 6,000 m` | 6000 |

No "prefer not to say".

**Required.** Gate: `case "altitude": return altitudeId !== null;` — `Onboarding.tsx:1521-1522`.

Footer note (`Onboarding.tsx:2093-2101`): **"Having reached an altitude once is not the same as being acclimatised for it — acclimatisation is lost within a few weeks back down low. ICEFALL treats this as history, not as current state."**

#### B10. Altitude illness — `Onboarding.tsx:2374-2401`

- eyebrow: `Altitude`
- title: `Have you had altitude sickness?`
- subtitle: **"This constrains how fast ICEFALL is willing to suggest you go up. It is not a diagnosis and ICEFALL will not offer one — altitude illness is a medical matter for a doctor who can see you."**

**Type: single select**, four rows (`ALTITUDE_ILLNESS`, `Onboarding.tsx:263-268`), each with a sub-note:

| Label | Note |
|---|---|
| `Never` | `Been to altitude and had no trouble.` |
| `Mild` | `Headache, poor sleep, loss of appetite.` |
| `Serious` | `HAPE or HACE, or a descent for symptoms.` |
| `Never been high enough to know` | `Not the same as never.` |

**Required.** Gate: `case "altitudeIllness": return altitudeIllness !== null;` — `Onboarding.tsx:1527-1528`.

#### B11. Current training baseline — `Onboarding.tsx:2403-2432`

- eyebrow: `Right now`
- title: `How much are you training at the moment?`
- subtitle: **"Where you are starting FROM. Without it a plan is built backwards from your date alone, and a beginner gets the same week as somebody already training five days — which is how people arrive at the mountain injured."**

**Type: single select**, five rows (`BASELINES`, `Onboarding.tsx:249-255`). Notes render only when non-empty (`Onboarding.tsx:2424`):

| Label | Note |
|---|---|
| `Not training right now` | `The plan starts from here, and builds.` |
| `Occasionally` | `Less than once a week.` |
| `1–2 days a week` | *(empty string — no note rendered)* |
| `3–4 days a week` | *(empty string)* |
| `5+ days a week` | *(empty string)* |

**Required.** Gate: `case "baseline": return baseline !== null;` — `Onboarding.tsx:1529-1530`.

#### B12. Limitations — `Onboarding.tsx:2434-2509`

- eyebrow: `Training around`
- title: `Anything ICEFALL should train around?`
- subtitle: **"So sessions stop loading something that should not be loaded. ICEFALL will not tell you what is wrong, whether it is healing, or when to return — that belongs with a doctor or a physiotherapist who can examine you."**

**Type: multi select**, eight tiles (`LIMITATIONS`, `Onboarding.tsx:237-246`):

`Knee`, `Back`, `Shoulder`, `Ankle or foot`, `Asthma or breathing`, `Heart`, `Recent surgery`, `Something else`

Plus a **conditional free-text box** (`Onboarding.tsx:2472-2486`), rendered only when `limitations.length > 0 || limitationsNote.trim() !== ""`:
- placeholder: **"Anything worth adding, in your own words — optional"**
- `aria-label`: `Anything worth adding`
- 3 rows, hard-capped at 300 characters via `e.target.value.slice(0, 300)` (`Onboarding.tsx:2477`)
- optional — it appears in no gate

Plus a mutually-exclusive tile (`Onboarding.tsx:2488-2504`): `Nothing right now`. Tapping it clears both the categories and the note (`Onboarding.tsx:2491-2493`); typing in the note or tapping a category clears it (`Onboarding.tsx:2450`, `:2476`).

**Required.** Gate: `case "limitations": return limitations.length > 0 || noLimitations;` — `Onboarding.tsx:1531-1532`.

Footer note (`Onboarding.tsx:2506-2510`): **"ICEFALL never asks you to train through pain, whatever is recorded here. If something hurts during a session, stop — that instruction does not depend on this answer, and no answer here removes it."**

#### B13. Gender — `Onboarding.tsx:2128-2154`

- eyebrow: `You`
- title: `How do you describe yourself?`
- subtitle (`Onboarding.tsx:2133`): **"Recorded on your account and read by nothing. It changes no session, no plan, no readiness figure and no calorie estimate — it is here because it belongs on a profile, not because something downstream is waiting on it. The next question asks about sex at birth, which is a different question and the only one of the two that changes a number."**

**Type: single select**, four rows, no sub-notes (`GENDERS`, `Onboarding.tsx:369-374`):

`Man`, `Non-binary`, `Woman`, `Prefer not to say`

(stored ids: `man`, `non-binary`, `woman`, `prefer-not-to-say`.)

**Required.** Gate: `case "gender": return gender !== null;` — `Onboarding.tsx:1538-1539`.

**Verified:** the subtitle's claim "read by nothing" holds. A grep across `src/screens`, `src/coach`, `src/settings`, `src/state`, `src/social` finds `gender` only in `Onboarding.tsx` (state + write), `AppState.tsx:376` (the type), and `settings/sync.ts:2570` (the server write). Nothing reads it back.

#### B14. Sex assigned at birth — `Onboarding.tsx:2158-2252`

- eyebrow: `You`
- title: `Sex assigned at birth?`
- subtitle (`Onboarding.tsx:2232`), verbatim and complete (re-checked character by character in the verification pass — it matches the source exactly):

  **"A different question from the last one, not a re-ask. Gender is who you are; this is one term in a published equation. ICEFALL estimates what your body uses at rest, and without a sex that estimate spans both terms and is wider for it. Unless this phone already holds an answer — from the Fuel screen, or from whoever used it before you — what you pick here becomes the term, as long as this phone will store it: choosing one narrows the estimate to it, and Prefer not to say keeps the wider band covering both and says on screen why rather than guessing. If it does already hold one, that answer stands and the Fuel screen is where it changes. How much a sex narrows the estimate depends on the rest of your numbers, so no single figure would be honest here. Nothing else reads this. The summary at the end says what was actually stored."**

**Type: single select**, three rows with sub-notes (`SEXES`, `Onboarding.tsx:479-494`):

| Label | Note, verbatim |
|---|---|
| `Female` | `The female term of the resting-energy equation — if this phone holds no answer yet and can store this one.` |
| `Male` | `The male term of the resting-energy equation — if this phone holds no answer yet and can store this one.` |
| `Prefer not to say` | `A recorded answer, not a blank — again, if this phone holds no answer yet and can store this one. If so, your daily estimate stays a wider band covering both terms and says on screen that ICEFALL doesn't hold one. If the phone does already hold an answer, your estimate keeps following that one, and the Fuel screen shows which it is.` |

**Required.** Gate: `case "sexAtBirth": return sexAtBirth !== null;` — `Onboarding.tsx:1540-1541`.

This is the only questionnaire answer that reaches a live computation from this screen. `completeOnboarding(answers)` (`Onboarding.tsx:1282`) calls `rememberSexForEnergyFromSignup` (`AppState.tsx:1063`), defined at `AppState.tsx:249-289`, which writes to the local fuel record via `rememberSexForEnergy` and returns one of five `SexNarrowing` states (`AppState.tsx:237-247`): `narrowed`, `decline-recorded`, `already-answered`, `not-kept`, `not-asked`. The equation itself is `mifflin` at `icefall-app/src/coach/fuelDay.ts:428-430`.

#### B15. Body numbers — `Onboarding.tsx:2256-2314`

- eyebrow: `You`
- title: `A few numbers about you.`
- subtitle: **"Weight is required — the calorie estimate has no other input, and without it every figure would describe an assumed 72 kg body instead of yours. The other two take 'prefer not to say'."**

**Type: three numeric entries.** Each uses `NumberField` (`Onboarding.tsx:3006-3054`) with `inputMode="numeric"` and a filter that strips anything but digits, `.` and `,` (`Onboarding.tsx:3038`).

| Field | Unit | Placeholder (= default shown, not a value) | Accepted range | "Prefer not to say"? |
|---|---|---|---|---|
| `Weight` | `kg` | `72` | 30–200 inclusive (`Onboarding.tsx:1488-1491`) | **No** |
| `Height` | `cm` | `178` | 100–250 inclusive (`Onboarding.tsx:1492-1495`) | **Yes** — an in-field pill |
| `Year of birth` | *(no unit)* | `1994` | `> 1900` and `<= currentYear - 5` (`Onboarding.tsx:1496-1499`) | **Yes** — an in-field pill |

No field is pre-filled; all three start as `""` (`Onboarding.tsx:962-964`). The placeholders are placeholder text only.

Field notes, verbatim:
- Weight, when a value is present but invalid (`Onboarding.tsx:2272`): **"Between 30 and 200 kg — outside that the estimate would be describing a typo."** Otherwise (`:2273`): **"Used for the calorie estimate on every session."**
- Height (`Onboarding.tsx:2285`): **"Recorded only. Nothing in ICEFALL uses it yet."**
- Year of birth (`Onboarding.tsx:2303`): **"Recorded only. ICEFALL will not turn your age into a heart-rate zone — that formula is a population average, not a measurement of you."**

The decline pill (`Onboarding.tsx:3040-3053`) reads `Prefer not to say` when off and **`Prefer not to say — your answer`** when on. Toggling it clears the typed value and disables the input (`Onboarding.tsx:2283-2286`, `:3034`, `:2303-2306`); typing clears the decline (`Onboarding.tsx:2275-2278`, `:2295-2298`).

**Required, partially.** Gate: `case "body": return validWeight && (validHeight || heightPrivate) && (validBirthYear || birthYearPrivate);` — `Onboarding.tsx:1524-1527`.

Note the height/birth-year note "Recorded only. Nothing in ICEFALL uses it yet." is **contradicted by other code in the same repository, and this was re-verified end to end in the verification pass**: `screens/Nutrition.tsx:640-647` calls `dailyEnergyFor({ bodyMassKgSet, heightCm: settings.heightCm ?? null, birthYear: settings.birthYear ?? null, … })`; `coach/fuelDay.ts:484-485` selects `mifflin` precisely when `heightCm !== null && ageY !== null`; and `mifflin` at `coach/fuelDay.ts:428-430` is `10 * massKg + 6.25 * heightCm - 5 * ageY + (sex === "male" ? 5 : -161)`. Both values are read, and giving a height is what upgrades the estimate from Schofield to Mifflin-St Jeor. The values written here go to `patchSettings({ heightCm, birthYear })` at `Onboarding.tsx:1253-1258`, i.e. the same settings store the Fuel screen reads. Treat the on-screen note as stale copy, not as a description of behaviour.

#### B16. Where did you find ICEFALL — `Onboarding.tsx:2314-2372`

- eyebrow: `ICEFALL`
- title: `Where did you find ICEFALL?`
- subtitle: **"The one question here that is for ICEFALL rather than for you — it changes nothing about your plan. One person reads these answers and decides where to spend their time. Nothing checks it, so 'I don't remember' and 'I'd rather not say' are real answers and cost you nothing."**

**Type: single select**, twelve rows (`HEARD_ABOUT`, `Onboarding.tsx:615-632`):

1. `A friend, or someone I climb with`
2. `A guide, a club, or an expedition company`
3. `Instagram`
4. `YouTube`
5. `TikTok`
6. `Reddit`
7. `A podcast`
8. `A search engine`
9. `A blog, forum, or news article`
10. `Somewhere else`
11. `I don't remember`
12. `I'd rather not say`

Rows 3–6 draw a real brand mark via `PlatformMark` when `hasPlatformMark(o.id)` is true; the rest draw a lucide pictogram (`Onboarding.tsx:2353-2361`).

**Required.** Gate: `case "heardAbout": return heardAbout !== null;` — `Onboarding.tsx:1542-1543`.

#### B17. Name — `Onboarding.tsx:2105-2126`

- eyebrow: `Your name`
- title: `Last one.`
- subtitle: **"What ICEFALL should call you. It stays on this device; there is no account server behind it."**

**Type: free text.** Placeholder `Your full name`, `autoComplete="name"`, `autoFocus`, Enter submits (`Onboarding.tsx:2113-2121`).

**Pre-filled** from the account created at signup: `useState(account?.name ?? "")` — `Onboarding.tsx:961`. In the normal flow the athlete has already typed a full name on `/auth/signup`, so this step usually opens already answered.

**Required.** Gate: `case "name": return name.trim().length > 0;` — `Onboarding.tsx:1544-1545`.

Leaving this step is what triggers the write: `if (step === "name") finish();` — `Onboarding.tsx:1553`.

Note: the subtitle's "there is no account server behind it" is contradicted by the same file — `finish()` calls `syncOnboarding` (`Onboarding.tsx:1327`) which upserts to Supabase `athlete_profiles` (`auth/account.ts:334-343`), and the athlete reached this screen through a real Supabase sign-up. Stale copy.

#### B-building. Building-your-plan reveal (not a question)

`BuildingPlan`, `Onboarding.tsx:2646-2691`, rendered at `Onboarding.tsx:2511-2516`. Header `Building your plan` (`Onboarding.tsx:2670`). No control in the footer (`Onboarding.tsx:2543-2547`). `useReducedMotion()` skips the whole step and advances immediately (`Onboarding.tsx:2655-2658`).

Its lines are computed in `buildingLines` (`Onboarding.tsx:1377-1440`), each conditional on an answer. Templates verbatim:
- `` `Reading your ${answered} answers` `` — where `answered = questions.length` (15–17)
- `` `${peak.name} · ${elevation} m` `` plus ` — {date or lowercased preset label}` when known
- `No objective yet — building general mountain fitness`
- `` `${days} — your days` ``
- `No fixed days — the week stays flexible`
- `` `Sessions at ${sessionMin} minutes` ``
- `` `Starting from: ${baseline label lowercased}` ``
- `` `Working around your ${limitation labels}` ``
- `Nothing that needs kit you do not have` (when `equipment` includes `none`)
- `` `Built for the ${n} pieces of kit you have` ``
- `Conservative ascent rates, as you asked` (when altitude illness is `mild` or `serious`)

Two of these overstate what the code does — see "What each answer actually reaches" below.

#### B-payoff. Payoff panel (not a question)

`Payoff`, `Onboarding.tsx:2696-3000`. Panel heading `What your answers changed` (`Onboarding.tsx:2790`). Footer button `Continue` → `navigate("/connect")` (`Onboarding.tsx:2551`).

The plan figures on it are recomputed by calling `buildPlanForGoal` on the goal just created (`Onboarding.tsx:2734-2755`), so they cannot drift from the generator.

---

### Where each answer is written

`finish()` — `Onboarding.tsx:1081-1334` — is the single write point. It runs once, guarded by `saved.current` (`Onboarding.tsx:1079-1083`). *(All line numbers in this subsection are corrected by +1 from the first draft; `Onboarding.tsx` was not edited during the audit, so this was drift, not movement.)*

**1. `updateCoachProfile({...})` — `Onboarding.tsx:1085-1098`**, into local React state persisted to `localStorage` (`AppState.tsx:1389-1394`). Fields written: `limitations`, `limitationsNote`, `altitudeIllness`, `trainingBaseline`, `disciplineExperience`, `availableEquipment`, `trainingDays`, `typicalSessionMin` (defaulting to `60`), `technicalSkills`, `maxAltitudeM`.

**2. `addGoal({...})` — `Onboarding.tsx:1141-1159`**, only when `goalPeak` is set. `targetDate` is either the picked day anchored at 06:00 local (`Onboarding.tsx:1131-1134`) or `monthsAhead(timeline.months)`.

**3. `setBodyMassKg(kg)` — `Onboarding.tsx:1248`**, clamped 30–200 in `AppState.tsx:1829`.

**4. `patchSettings({...})` — `Onboarding.tsx:1252-1272`**: `heightCm`, `birthYear`, `trainingIntent`, `sessionGoal`. The last two are **derived, not asked** — `derivedIntent` at `Onboarding.tsx:1238-1245`: `"vertical"` if there is a goal peak, else `"endurance"` if trail-running was selected, else `"vertical"` if mountaineering or ski-touring, else `"endurance"`.

**5. `completeOnboarding(answers)` — `Onboarding.tsx:1283`.** Its body (`AppState.tsx:1030-1116`) persists only five things — `onboarded`, `name`, `disciplines`, `experience`, `customGoals` — plus the fuel-record sex write. **It does not persist `limitations`, `altitudeIllness`, `trainingBaseline`, `gender`, `heardAbout` or `declined` locally**; those exist only inside the object handed to the server.

**6. `syncOnboarding({...answers})` — `Onboarding.tsx:1328`** → `auth/account.ts:329-349`. Upserts `athlete_profiles` with `experience`, `answers` (the whole blob, jsonb), `answers_version: 1`, `onboarded_at`. Errors are swallowed (`auth/account.ts:344-348`) and nothing is retried — there is no outbox on this path.

**7. `saveSignupAnswers({ gender, heardAbout })` — `Onboarding.tsx:1329-1332`** → `settings/sync.ts:2547+`, updating `athlete_profiles.gender` and `athlete_profiles.heard_about`.

**8. `saveSexAtBirth({ sexAtBirth })` — `Onboarding.tsx:1333`** → `settings/sync.ts:2792+`, updating `athlete_profiles.sex_at_birth`.

Calls 7 and 8 are chained inside `syncOnboarding(...).then(...)` deliberately, so the UPDATEs cannot race the upsert that creates the row (comment at `Onboarding.tsx:1285-1327`; code at `Onboarding.tsx:1328-1334`).

The `declined` object (`Onboarding.tsx:1188-1196`) records which "none/prefer not to say" answers were given: `noLimitations`, `noDisciplines`, `noFixedTrainingDays`, `noTechnicalSkills`, `heightDeclined`, `birthYearDeclined`, `noObjectiveYet`. It travels only inside the `answers` blob.

#### Database shape

`athlete_profiles` is created at `icefall-supabase/migrations/20260830100000_identity_username_location.sql:147-181`. It has **typed columns** `experience` (`:152`), `body_mass_kg` (`:153`), `height_cm` (`:154`), `birth_year` (`:155`), `typical_session_min` (`:156`), `training_days smallint[]` (`:157`), `max_altitude_m` (`:158`), plus `answers jsonb` (`:162`) and `answers_version` (`:163`).

⚠️ **Whether this migration — or any of the 69 in `icefall-supabase/migrations` — has actually been applied to the live Supabase project CANNOT BE DETERMINED FROM THE REPOSITORY.** Nothing in the repo records a deployment state, and `icefall-app/src/settings/sync.ts:25-34` argues explicitly that a deployment state written into a comment is unreliable and was wrong the last time somebody tried it. Every database statement in this section is a statement about the migration **file**.

**Only `experience`, `answers`, `answers_version` and `onboarded_at` are ever written** (`auth/account.ts:336-340`, inside the upsert at `:334-343`). Re-verified column by column in the verification pass: a `grep -rn` per column across `icefall-app/src` returns, in total, the six type declarations at `src/backend/types.ts:99-104` and one prose comment at `src/social/publicProfile.ts:49`. **Not implemented: no client code writes or reads the six typed columns.**

`gender`, `sex_at_birth` and `heard_about` were added later — `20260903040000_gender_and_heard_about.sql:177`, `:420`, `:699`. CHECK constraints: gender in `('woman','man','non-binary','prefer-not-to-say')` (`:263-265`); sex_at_birth in `('female','male','prefer-not-to-say')` (`:423-425`); `heard_about` is a foreign key to `heard_about_channels(slug)` (`:702-705`). RLS on `athlete_profiles` is owner-only for select/insert/update (`20260830100000...sql:185-201`).

The column comment on `sex_at_birth` (`20260903040000...sql:427-431`) states it is "WRITE-ONLY TODAY: no client query reads this column back." That matches the code — no `select` names it.

---

### What each answer actually reaches (relevant to a coaching redesign)

| Answer | Written to | Read by executable code? |
|---|---|---|
| disciplines | `state.disciplines` + `answers` | Yes — display and `coachProfile.disciplineExperience` consumers |
| experience level per discipline | `coachProfile.disciplineExperience` | Yes — passed as self-reported context to `mountainReadiness` (`coach/mountainReadiness.ts:1179`), and surfaced in the coach prompt (`coach/context.ts:154`) |
| goal + timeline | `customGoals` via `addGoal` | Yes — `buildPlanForGoal(goal, mountain, now)` (`tracking/training.ts:169`) builds the entire plan from `targetDate` |
| training days | `coachProfile.trainingDays` | **Not read by the plan generator.** `buildPlanForGoal` takes only `(goal, mountain, now)` — `tracking/training.ts:169`. Re-verified: a grep of that entire file for `coachProfile`, `trainingDays`, `typicalSessionMin` and `experience` returns nothing. The only reader is `coach/context.ts:153`, `:268`, which prints it into the LLM system prompt |
| session length | `coachProfile.typicalSessionMin` | **Not read by the session generator.** `buildSession({ day, goalName, equipment, experience })` — `coach/sessions.ts:740-746`. The only reader is `coach/context.ts:154`, `:271` (LLM prompt) |
| equipment | `coachProfile.availableEquipment` | Yes — `SessionDetail.tsx:243` → `statedEquipment` (`SessionDetail.tsx:107`) → `buildSession({ day, goalName, equipment })` (`SessionDetail.tsx:259`). `statedEquipment` returns `undefined` for an empty list so "never asked" is not read as "owns nothing". Note the call passes **no `experience` argument**, though `buildSession` accepts one |
| technical skills | `coachProfile.technicalSkills` | Yes — `coach/mountainReadiness.ts:1177` → `technicalDimension` (`:667`) → `skillClaimed` (`:643`) |
| highest altitude | `coachProfile.maxAltitudeM` | Yes — `coach/mountainReadiness.ts:1174` → `bestAltitude` (`:772`) |
| altitude illness | `coachProfile.altitudeIllness` | **Prompt only.** `coach/context.ts:159`, and `context.ts:401-404` adds a sentence to the system prompt for `mild`/`serious`. Nothing in `tracking/training.ts` or `coach/sessions.ts` reads it |
| training baseline | `coachProfile.trainingBaseline` | **Prompt only** — `coach/context.ts:160`, `:275` |
| limitations + note | `coachProfile.limitations` / `limitationsNote` | **Prompt only** — `coach/context.ts:157-158`, `limitationsBlock` at `context.ts:390-404`. `buildSession` does not take a limitations argument (`coach/sessions.ts:740-745`), so the building-screen line `Working around your {knee}` (`Onboarding.tsx:1421-1427`) is not reflected in the generated session |
| gender | `answers.gender`, `athlete_profiles.gender` | **Read by nothing** — confirmed by grep |
| sex at birth | `answers.sexAtBirth`, `athlete_profiles.sex_at_birth`, **and** the local fuel record | Yes, locally — `AppState.tsx:1063` → `rememberSexForEnergyFromSignup` (`AppState.tsx:249-289`) → the record `screens/Nutrition.tsx` feeds to `dailyEnergyFor` |
| weight | `state.bodyMassKg` | Yes — the energy estimate |
| height / birth year | `settings.heightCm` / `settings.birthYear` | Yes — `screens/Nutrition.tsx:644`, `coach/fuelDay.ts:428-430` (Mifflin-St Jeor) |
| heard about | `answers.heardAbout`, `athlete_profiles.heard_about` | Read by nothing in the app |
| name | `state.name`, `answers.name` | Yes — `user.name` at `AppState.tsx:975` |

The file's own header comment (`Onboarding.tsx:57-66`) names `trainingDays` and `typicalSessionMin` as the two answers "stored on the profile and read by nothing". **That is accurate as far as the plan/session generators go, and slightly overstated in the other direction** — both are printed into the coach's system prompt at `coach/context.ts:268` and `:271`, so an LLM reply can reference them even though no deterministic generator consults them. The same header lists `limitations` under "genuinely consumed" via the coach; that is prompt-level consumption only.

---

### Can the athlete edit these answers later?

**Mostly no.** Here is what the code supports, per answer.

#### No edit path exists for the coach-profile answers

`updateCoachProfile` is exported from `AppState.tsx:1389` and called from exactly two places in the whole app (re-greped in the verification pass; confirmed):

- `screens/Onboarding.tsx:1085` — this questionnaire
- `screens/growth/ReadinessTest.tsx:778` — `updateCoachProfile(coachProfilePatchFrom(answers, coachProfile))`, the standalone free "readiness test" funnel at `/readiness-test` (`App.tsx:415`), which is a different questionnaire reachable without an account

**What that second write can overwrite — RESOLVED in the verification pass.** `coachProfilePatchFrom` (`growth/readinessTest.ts:475-493`) returns exactly `{ disciplineExperience, ...(typeof altitude === "number" ? { maxAltitudeM: altitude } : {}) }`. Inside it:

- the `mountaineering` rung is **set** from the chosen option's `rung` if one was chosen, and **`delete`d** from the stored map when the answer was "None yet" (`readinessTest.ts:482-485`) — the comment there says "The latest self-report is the one that counts, in both directions";
- `maxAltitudeM` is the chosen band's value, and is omitted entirely (rather than nulled) when no band was chosen (`:487`, `:491`).

Because `updateCoachProfile` is a shallow merge (`AppState.tsx:1391`), **re-taking the free readiness test can change or erase exactly two onboarding answers — the mountaineering experience rung and the highest-altitude figure — and touches nothing else on the coach profile.** Equipment, technical skills, training days, session length, limitations, baseline and altitude illness are not reachable from it.

Everything else that touches `coachProfile` only reads it: `screens/coach/SessionDetail.tsx:242`, `screens/coach/Progress.tsx:128`, `screens/mountain/Benchmark.tsx:193`, `screens/mountain/CommandCentre.tsx:555`, `screens/explore/People.tsx:417`, `screens/explore/GroupWorkspace.tsx:239`, `screens/growth/ShareReadiness.tsx:262`, `screens/growth/ReadinessResult.tsx:501`, `coach/context.ts:153-160`, `passport/usePassport.ts`, `passport/model.ts`.

**So: disciplines-experience, training days, session length, equipment, technical skills, highest altitude, altitude illness, training baseline and limitations have no edit screen.** The only ways to change them are (a) re-running the readiness test at `/readiness-test`, which patches a subset, or (b) the destructive reset described below.

Settings was checked directly. `/settings` renders `screens/settings/Settings.tsx` (`App.tsx:118`, `:563`) — a link list only. `/settings/:section` renders `screens/settings/Sections.tsx` (`App.tsx:101`, `:573`), whose switch (`Sections.tsx:123-172`, re-read in full in the verification pass) has **no case** that edits equipment, technical skills, max altitude, training days, session length, limitations, training baseline or altitude illness. `Mountain CV` (`Sections.tsx:3283-3308`) states in its own copy: *"Your CV is assembled from the Mountain Passport — summits, highest altitude, technical ground and the skills you reported. Nothing in it can be typed in by hand"* — and it renders only a visibility `ChoiceRow`, no editor.

Note: `icefall-app/src/screens/Settings.tsx` (the older file, which does contain a body-mass number input at line 60 and an "Erase all data and replay onboarding" button at line 119) is **not routed and not imported anywhere** — `grep -rn "from \"@/screens/Settings\"" src` returns nothing. Do not treat it as a live edit surface.

#### What can be edited, and where it writes

**Weight, height, year of birth, and sex-for-energy** — Fuel inputs screen, route **`/coach/nutrition`** (`App.tsx:649`), which renders `FuelDetails` (`screens/coach/details.tsx:35-41`) wrapping `screens/Nutrition.tsx`. Header title: `Fuel inputs` (`details.tsx:37`). Reachable via the "Adjust" link on the Fuel tab (`details.tsx:11-13`).

- Weight → `setBodyMassKg(v)` at `Nutrition.tsx:968` — **the same store the questionnaire wrote to** (`AppState.tsx:1828`).
- Height → `patchSettings({ heightCm: v })` at `Nutrition.tsx:1071`, min 100 max 250 — **the same store** (`Onboarding.tsx:1255`).
- Year of birth → `patchSettings({ birthYear: v })` at `Nutrition.tsx:1109`, min 1900 max current year — **the same store** (`Onboarding.tsx:1256-1257`).
- Sex → `patchFuel({ sexForEnergy: v, sexForEnergyDeclined: false })` at `Nutrition.tsx:1030`, under the heading **`Resting energy`** (not "Sex" — `Nutrition.tsx:1011`). This writes the **local fuel record**, which is the same place `rememberSexForEnergyFromSignup` wrote to (`AppState.tsx:255`, `:270`). It does **not** write back to `answers.sexAtBirth` or to `athlete_profiles.sex_at_birth` — those two remain whatever signup set.

Each of the last three also offers a `Prefer not to say` button that sets a separate declined flag (`Nutrition.tsx:1032-1039`, `:1073-1080`, `:1107-1114`).

**Goal / timeline** — `screens/Goals.tsx`. This **adds a new goal** (`addGoal` at `Goals.tsx:105` and `:137`); there is no edit-in-place. Its horizons are a different, shorter set than onboarding's — `HORIZONS` at `Goals.tsx:20-24`: `6 months`, `1 year`, `2 years`. **There is no date picker on this screen** and no "not sure" option; `targetDate` is always `monthsAhead(months)` (`Goals.tsx:124`, `:140`). So a custom target date chosen during onboarding cannot be changed anywhere.

**Name** — the questionnaire's name goes to `state.name` (`AppState.tsx:1109`) and `answers.name`. Settings › Edit profile has a name control (`Sections.tsx:2136`, `NameField` defined at `Sections.tsx:738`), but it writes `displayName` through `useFieldSync("displayName", …)` → `settings/sync.ts:1572-1587`, i.e. the public `profiles` record, capped at 80 characters. **Nothing observed writes back to AppState `state.name` or to `answers.name`.** These are two different fields.

**Username / town / country** — no edit screen was found under `screens/settings/`. The subtitle on the handle screen says it "can't be changed often" (`Handle.tsx:395`), and `20260903030000_username_reclaim_window.sql` exists, but **no client screen that renames a handle was found.** Re-checked in the verification pass against the full `case` list of `screens/settings/Sections.tsx:123-172` (23 sections: profile, share, verification, passport, account, security, privacy, location, safety, professional, mountains, cv, data, devices, offline, membership, referrals, notifications, support, contact, legal, about, manage) — none of them is a username editor.

**Gender and "where did you find ICEFALL"** — no edit path found anywhere in the app.

**The blanket reset — RESOLVED in the verification pass.** Two live controls call `resetAll`, and neither is on `/settings/data`:

1. **`/settings/manage`** → `ManageAccount` (`screens/settings/Sections.tsx:3852+`, routed by `case "manage"` at `Sections.tsx:168-169`). Under a danger rule headed **"Delete everything"** (`Sections.tsx:3921`): *"This erases every activity, objective, setting and achievement on this device and restarts onboarding. Nothing is backed up, so there is no way to undo it."* (`:3923-3926`). Two taps — `Delete account data` (`:3951`) then `Erase` (`:3944`) — and the handler is `resetAll(); navigate("/"); window.location.reload();` (`Sections.tsx:3938-3942`).
2. **The profile screen**, a text button labelled **`Reset all local data`** (`screens/Profile.tsx:1245-1264`), handler `resetAll(); window.location.replace("/");` (`:1256-1259`).

`resetAll` itself is `AppState.tsx:1147`, and its own comment (`AppState.tsx:1119-1146`) records that it clears by the `icefall.` key prefix because the app writes thirty-six keys and an explicit list went stale. The **unrouted** `screens/Settings.tsx:110-120` also contains such a button; that file is dead (see the note below).

#### Re-running the questionnaire

`/onboarding` is an ordinary route with no guard of its own (`App.tsx:429`), so navigating there re-runs the flow. **Resolved in the verification pass:** a repo-wide grep for `"/onboarding"` finds it navigated to from five places, **all of them auth screens** — `auth/Auth.tsx:784` and `:790`, `auth/Handle.tsx:385`, `auth/NewPassword.tsx:56`, `auth/Callback.tsx:85`. **There is no in-app link to it from any post-onboarding screen**; it is reachable only by typing the URL. `finish()` would then call `addGoal` again, creating a **second** goal (the comment at `Onboarding.tsx:1101-1120` says the duplicate is accepted deliberately), and `updateCoachProfile` merges rather than replaces (`AppState.tsx:1391`).

#### The second-device gap

On sign-in, `Auth.tsx:775-786` calls `storedOnboarding()` (`auth/account.ts:364-379`) and hands the blob to `completeOnboarding`. Because `completeOnboarding` persists only `onboarded`, `name`, `disciplines`, `experience` and `customGoals` (`AppState.tsx:1030-1116`), **the coach-profile answers — equipment, skills, altitude, training days, session length, limitations, baseline, altitude illness — are not restored on a new device**, and there is no screen on which to re-enter them short of re-running `/onboarding`. `validAnswers` (`auth/account.ts:397-405`) also rejects any blob missing `name`, `experience`, `disciplines` or `goalName`, sending the athlete back through the questions.

---

### Comment-vs-code checks performed

Claims in the source that I verified against executable code:

| Claim (and where it is made) | Verdict |
|---|---|
| Intro: "17 questions at most — a couple drop out" (`Onboarding.tsx:2582`) | **True, and independently recounted.** 17 entries in `ALL_QUESTION_STEPS` (`:893-909`); exactly 2 conditional pushes, at `:1015` and `:1017` |
| Gender step: "read by nothing" (`Onboarding.tsx:2133`) | **True.** No reader found |
| `trainingDays` / `typicalSessionMin` "read by nothing" (header, `Onboarding.tsx:57-66`) | **True for the generators** (`tracking/training.ts:160`, `coach/sessions.ts:740`); both *are* printed into the coach prompt (`coach/context.ts:268`, `:271`) |
| Days step: "the generated week is currently a fixed six sessions and one rest day" (`Onboarding.tsx:1932-1936`) | **Consistent with** `buildPlanForGoal` (`tracking/training.ts:169`) not receiving `coachProfile`; the actual per-week counts are read back from the generator on the payoff screen (`Onboarding.tsx:2749-2753`) rather than hardcoded |
| Equipment step: "ICEFALL will not prescribe a movement that needs kit you don't have" (`Onboarding.tsx:1975`) | **True** — `SessionDetail.tsx:243, 259` → `buildSession({…, equipment})` |
| Body step: height/birth year "Recorded only. Nothing in ICEFALL uses it yet." (`Onboarding.tsx:2285`, `:2303`) | **FALSE — re-verified end to end.** Both are Mifflin-St Jeor terms (`coach/fuelDay.ts:428-430`), selected by `coach/fuelDay.ts:484-485`, fed from the same settings store at `Nutrition.tsx:644-645` |
| Name step: "there is no account server behind it" (`Onboarding.tsx:2111`) | **False.** `syncOnboarding` upserts to Supabase (`Onboarding.tsx:1328`, `auth/account.ts:334-343`) |
| Handle: "258 entries" (`Handle.tsx:50`) | **True.** 258 `{ code: "` rows in `COUNTRIES` |
| Migration comment: `sex_at_birth` is "WRITE-ONLY TODAY" (`20260903040000...sql:429`) | **True.** No client `select` names it |
| Equipment: "Bodyweight only" is mutually exclusive with real kit | **Not implemented.** The handler is a plain toggle (`Onboarding.tsx:1985`); the exclusivity exists only in the copy |
| Building screen: `Working around your {limitations}` (`Onboarding.tsx:1426`) | **Overstated to the point of being false today.** Limitations reach the LLM system prompt only (`coach/context.ts:405-432`), **and no model is called in this build** — see sections 2 and 3. `buildSession` has no limitations parameter (`coach/sessions.ts:740-746`) |
| Building screen: `Conservative ascent rates, as you asked` (`Onboarding.tsx:1437`) | **Overstated in the same way.** It is one added sentence in a system prompt that is never sent (`coach/context.ts:416-419`), not a constraint on any generator. `grep -n "altitudeIllness" src/services/coach.ts` returns nothing |

---

### Small behavioural details worth knowing before a redesign

- The `next()` handler ignores `canAdvance` for the intro, building and payoff steps because they fall to `default: return true` (`Onboarding.tsx:1546-1547`).
- `steps` is a `useMemo` over `[disciplines.length, goalPeak]` (`Onboarding.tsx:1073`) while `index` is an independent integer (`Onboarding.tsx:926`). Going back and changing the disciplines or the goal changes the array's length without changing `index`, so the athlete can land on a different step than the one they left. This is derived from the code; it was not observed running.
- `AnimatePresence` is deliberately **not** `mode="wait"` (comment and code at `Onboarding.tsx:1610-1618`), so steps overlap during the transition.
- `finish()` is guarded against a double run by a ref, not by state (`Onboarding.tsx:1082-1086`), and its dependency array is listed at `Onboarding.tsx:1334-1361`.
- The progress bar draws one hairline segment per live question (`Onboarding.tsx:1578-1592`) and fills every segment on `building`/`payoff`.
- No secrets or credentials appear anywhere in this flow. The password typed on `/auth/signup` is validated and passed to `signUpWithEmail`; `AppState.tsx:648-651` states no password is persisted locally, and the local `Account` interface (`AppState.tsx:652-657`) has no password field.

---

### Verification pass — 2026-09-11

Independently re-checked. Corrections are marked inline. Summary:

- **RESOLVED (was flagged as an in-flight inconsistency):** `coach/context.ts` now declares
  `surveyed: boolean` on `ObjectiveContext` (`:81`). The file is settled and typechecks. §2.5.9 is
  rewritten with current line numbers.
- **CORRECTED:** the six dead typed columns are declared at
  `20260830100000_identity_username_location.sql:153-158`, not `:150-156`. The claim itself —
  written by nothing, read by nothing — was re-verified one column at a time and **holds**.
- **CORRECTED:** `buildPlanForGoal` is at `tracking/training.ts:169`, not `:160`; `demandFor` at
  `:163`. `MIN_WEEKS = 8` / `MAX_WEEKS = 52` are at `:28-29`.
- **CORRECTED:** the `sync.ts:25-34` quote is restored in full (an elision was removing a clause).
- **CORRECTED:** several `screens/Onboarding.tsx` line numbers are off by one throughout this
  section — `finish()` is `:1081-1334`, `updateCoachProfile({…})` `:1085-1098`, the `answers` blob
  `:1198-1229` with `goalName: ""` at `:1228`, `patchSettings({…})` `:1252-1272`,
  `completeOnboarding(answers)` `:1283`, and the three chained server writes `:1328-1334`.
  `Onboarding.tsx` was **not** edited during the audit (last modified 2026-09-10 18:38), so this is
  drift in the first draft, not file movement.
- **RE-CONFIRMED exactly:** the "nine RULES plus FALLBACK" count (section 3 of this audit said
  eight and is wrong); the 27 distinct PostgREST tables and the five `athlete_profiles` call sites
  (`settings/sync.ts:2577`, `:2816`, `auth/account.ts:279`, `:334`, `:370`); `syncOnboarding`'s
  upsert payload (`auth/account.ts:334-343`) and its swallowed error (`:344-348`);
  `completeOnboarding`'s five-field return (`AppState.tsx:1106-1113`) and the `sexAtBirth` diversion
  (`:1063`); the `ABSENT` code set (`backend/pgErrors.ts:32`); `SIGNUP_ANSWER_NOT_DEPLOYED`
  verbatim (`settings/sync.ts:204-205`, used at `:2620` and `:2849`); `storedOnboarding`
  (`auth/account.ts:364-379`) and `validAnswers` (`:397-405`); `coachProfilePatchFrom`
  (`growth/readinessTest.ts:475-493`) returning only `{disciplineExperience, maxAltitudeM?}`;
  `trainingIntent` having no reader outside a fixture; `ageBand` being read only by the settings
  screen that writes it; every localStorage key; and the Mifflin-St Jeor chain
  (`screens/Nutrition.tsx:643-646` → `coach/fuelDay.ts:428-430`).
- **RE-CONFIRMED:** no LLM is called. `VITE_COACH_ENDPOINT` is absent from `icefall-app/.env.local`
  (which declares exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — values
  [secret — not reproduced]) and from `vercel.json`. The compiled `askCoach` in **both**
  `dist/assets/coach-8k75RJyC.js` and `dist-verify/assets/coach-CClCJY3H.js` contains no `fetch(`
  and no model id; `grep -c 'fetch('` is 0 in both.
- **NEW, and not in the first draft:** a fourth store now exists on the server side and is
  unreachable. Another session created `icefall-supabase/supabase/functions/health/` between 00:32
  and 00:39 on 2026-09-11 (Polar / WHOOP / Withings / Oura adapters, plus `index.ts`). It queries
  `health_connections`, `health_oauth_states`, `health_pending_links` and `health_webhook_events`
  and calls `rpc("health_sweep_states")`. **None of those four tables and none of that function
  appears in any of the 69 migration files**, no client code references it, and the app files its
  own comments point at (`icefall-app/src/health/types.ts`, `icefall-app/src/health/PolarCredit.tsx`)
  do not exist. It stores nothing today.
- **Migration count:** 69 `.sql` files, all in `icefall-supabase/migrations`.
- **Deployment state:** unchanged and worth repeating — **whether any migration named in this
  section has been applied to the live Supabase project cannot be determined from the repository.**
  Every DB statement here is a statement about a migration file.

---

# SECTION 2 — WHERE THE ANSWERS GO

All paths below are relative to `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/`.
App source = `icefall-app/src/…`; migrations = `icefall-supabase/migrations/…`.

Two notes before the detail:

- **This file was read while another session was editing it.** `icefall-app/src/coach/context.ts`
  changed on disk mid-audit. Everything cited below is from the version on disk at the end of the
  audit (440 lines). See "In-flight inconsistency" at the end of the DERIVED section.
- Several long comments in this codebase describe behaviour that the executable code does **not**
  have. Where I found that, I say so and cite the code, not the comment.

---

### 2.1 The one-paragraph answer

An onboarding answer can land in up to five places, and **no single answer lands in all of them**:

| Store | Kind | Key / table |
|---|---|---|
| `icefall.state.v1` | localStorage (device) | `AppState.tsx:33` |
| `icefall.settings.v1` | localStorage (device) | `settings/store.ts:213` |
| `icefall.fuel.v1` | localStorage (device) | `coach/fuelRecord.ts:29` |
| `public.athlete_profiles.answers` (jsonb blob) | server | `auth/account.ts:334-343` |
| `public.athlete_profiles.<typed column>` | server | `settings/sync.ts:2577`, `2816` |

There is **no** server table for goals/objectives, equipment, training days, technical skills,
altitude band, session length, height, birth year or body mass. Grep of every PostgREST table the
app touches (`icefall-app/src`, 27 distinct tables) shows `athlete_profiles` reached from exactly
five call sites: `settings/sync.ts:2577`, `settings/sync.ts:2816`, `auth/account.ts:279`,
`auth/account.ts:334`, `auth/account.ts:370`.

---

### 2.2 THE LOCAL MODEL

#### 2.2.1 `icefall-app/src/state/AppState.tsx` — key `icefall.state.v1` (`AppState.tsx:33`)

Read at `AppState.tsx:551-569` (`load()`), written by an effect on every state change at
`AppState.tsx:964-970`.

**The answer type that onboarding hands over** — `OnboardingAnswers`, `AppState.tsx:343-459`:

```
declined?: OnboardingDeclined     (343-345)
limitations?: string[]            (355)
limitationsNote?: string          (356)
altitudeIllness?: string | null   (358)
trainingBaseline?: string | null  (360)
gender?: Gender                   (376)
sexAtBirth?: SexAtBirth           (438)
heardAbout?: HeardAboutChannel    (452)
name: string                      (453)
disciplines: Discipline[]         (454)
experience: ExperienceLevel       (455)
goalName: string                  (456)
goalMountainId?: string           (457)
goalElevationM?: number           (458)
```

`OnboardingDeclined` (`AppState.tsx:332-341`) — all `boolean`:
`noDisciplines`, `noFixedTrainingDays`, `noTechnicalSkills`, `heightDeclined`,
`birthYearDeclined`, `noObjectiveYet`, `noLimitations`.

Closed vocabularies:
- `Gender = "woman" | "man" | "non-binary" | "prefer-not-to-say"` (`AppState.tsx:112`)
- `SexAtBirth = "female" | "male" | "prefer-not-to-say"` (`AppState.tsx:148`)
- `HeardAboutChannel = "friend" | "guide-or-operator" | "instagram" | "youtube" | "tiktok" | "reddit" | "podcast" | "search" | "article" | "somewhere-else" | "dont-remember" | "prefer-not-to-say"` (`AppState.tsx:310-322`)

**CRITICAL — `completeOnboarding` throws most of that object away.**
`AppState.tsx:1030-1117`. The whole persisted result is `AppState.tsx:1106-1113`:

```
return {
  ...s,
  onboarded: true,
  name: a.name.trim() || USER.name,
  disciplines: a.disciplines,
  experience: a.experience,
  customGoals,
};
```

So of the fourteen fields on `OnboardingAnswers`, `completeOnboarding` persists **four**
(`onboarded`, `name`, `disciplines`, `experience`) plus a goal built from `goalName` /
`goalMountainId` / `goalElevationM` (`AppState.tsx:1078-1104`). `declined`, `limitations`,
`limitationsNote`, `altitudeIllness`, `trainingBaseline`, `gender`, `heardAbout` are **never
written to `icefall.state.v1` by this function**. `sexAtBirth` is not written to
`icefall.state.v1` either — it is diverted to `icefall.fuel.v1` at `AppState.tsx:1063`
(`rememberSexForEnergyFromSignup(a.sexAtBirth)`, implementation `AppState.tsx:249-288`).

**`Persisted`** — the shape of `icefall.state.v1` (`AppState.tsx:461-527`). Onboarding-relevant
fields:

| Field | Type | Line |
|---|---|---|
| `onboarded` | `boolean` | 462 |
| `memberSince?` | `string` (ISO, stamped once) | 472 |
| `name?` | `string` | 473 |
| `disciplines?` | `Discipline[]` | 474 |
| `experience?` | `ExperienceLevel` | 475 |
| `customGoals` | `Goal[]` | 476 |
| `bodyMassKg?` | `number` — optional on purpose, "undefined means the athlete has never told us" | 481-488 |
| `coachProfile?` | `CoachProfile` | 498 |
| `objectives?` | `SavedObjective[]` | 490 |
| `checkIns?`, `coachUsage?`, `coachBudget?`, `notifications?` | — | 496-501 |

**`CoachProfile`** — where the *substantive* training answers live (`AppState.tsx:617-641`):

```
disciplineExperience: Record<string, "beginner"|"intermediate"|"advanced"|"expert">  (619)
availableEquipment: string[]        (621)
trainingDays: number[]  // 0 = Sunday (623)
typicalSessionMin: number           (624)
technicalSkills: string[]           (626)
maxAltitudeM?: number               (628)
limitations?: string[]              (635)
limitationsNote?: string            (636)
altitudeIllness?: string | null     (638)
trainingBaseline?: string | null    (640)
```

Default value `EMPTY_COACH_PROFILE` (`AppState.tsx:533-539`): `{}`, `[]`, `[]`,
`typicalSessionMin: 60`, `[]`. Note the non-null default `60` — it is written back verbatim by
onboarding when the question was skipped (`screens/Onboarding.tsx:1092-1094`), so
`typicalSessionMin` cannot distinguish "answered 60" from "never answered".

Written only through `updateCoachProfile` (`AppState.tsx:1389-1394`), a shallow merge:
`{ ...EMPTY_COACH_PROFILE, ...(s.coachProfile ?? {}), ...patch }`.

`bodyMassKg` is written by `setBodyMassKg` (`AppState.tsx:1828-1830`), clamped
`Math.max(30, Math.min(200, Math.round(kg)))`. It is exposed twice:
`bodyMassKg` (defaulted to `DEFAULT_BODY_MASS_KG = 72`, `AppState.tsx:49`) and `bodyMassKgSet`
(`AppState.tsx:776`, `1912`: `typeof state.bodyMassKg === "number" ? state.bodyMassKg : null`).

**Who actually writes the coach profile at signup**: `screens/Onboarding.tsx:1084-1097`, one
`updateCoachProfile` call carrying `limitations`, `limitationsNote`, `altitudeIllness`,
`trainingBaseline`, `disciplineExperience`, `availableEquipment`, `trainingDays`,
`typicalSessionMin`, `technicalSkills`, `maxAltitudeM`. This is the ONLY path by which the
train-around answers reach storage at all.

#### 2.2.2 `icefall-app/src/settings/store.ts` — key `icefall.settings.v1` (`store.ts:213`)

Read `store.ts:215-224`, write `store.ts:233-241`, non-component accessors `currentSettings()` /
`patchSettings()` at `store.ts:257-263`.

`SettingsState` (`store.ts:74-167`). Onboarding-relevant fields:

| Field | Type | Line | Set by onboarding? |
|---|---|---|---|
| `heightCm?` | `number` | 148 | yes — `Onboarding.tsx:1255` |
| `birthYear?` | `number` | 149 | yes — `Onboarding.tsx:1256-1257` |
| `trainingIntent?` | `string` | 151 | yes — `Onboarding.tsx:1269` (derived, see 2.5) |
| `sessionGoal?` | `string` | 156 | yes — `Onboarding.tsx:1270` (derived) |
| `packWeightKg?` | `number` | 154 | no |
| `autoPause?` | `boolean` | 158 | no |
| `defaultActivity?` | `string` | 160 | no |
| `ageBand` | `"under-18"\|"18-24"\|"25-34"\|"35-44"\|"45-54"\|"55-plus"\|"unset"` | 130 | no — settings screen only |

The rest of `SettingsState` is profile/visibility/notification/application state, not onboarding.
Defaults at `store.ts:171-211`; `heightCm`, `birthYear`, `trainingIntent`, `sessionGoal` are
**absent from `DEFAULT_SETTINGS`**, i.e. `undefined` = never given.

Height and birth year are written with an explicit `undefined` when declined
(`Onboarding.tsx:1251-1257`): the *decline* is not representable in this store; it rides on
`OnboardingDeclined.heightDeclined` / `birthYearDeclined`, which — per 2.2.1 — reach only the
server blob, never `icefall.state.v1`.

`ageBand` is stored and read by nothing outside the settings screen that sets it
(`screens/settings/Sections.tsx:3125-3131`; the app's own comments say so at
`screens/explore/Community.tsx:488` and `:1058`; verified by grep — the only other hits are the
type declaration, the default, and a fixture).

`memberId(name)` (`store.ts:308-317`) is a derived display id: FNV-1a over
`` `${name || "athlete"}|${KEY}` ``, base-36, uppercased, rendered `ICE-XXXX-XXXX`. Not stored.

#### 2.2.3 `icefall-app/src/coach/fuelRecord.ts` — key `icefall.fuel.v1` (`fuelRecord.ts:29`)

`rememberSexForEnergy` (`fuelRecord.ts:76-108`) writes `{ sexForEnergy?: "female"|"male",
sexForEnergyDeclined?: true }`. It **refuses to overwrite** an existing answer
(`fuelRecord.ts:85-87`) and returns `"stored" | "already-answered" | "nothing-to-store"`.
It has no reader (`fuelRecord.ts:20-23`) — the Fuel screen reads the key itself.

This record is the only place the sex answer is readable by the app: `screens/Nutrition.tsx:646`
passes `fuel.sexForEnergy` into `dailyEnergyFor`. Other fields on that record, owned by the Fuel
screen: `dailyMovement`, `heightCmDeclined`, `birthYearDeclined`, food log
(`screens/Nutrition.tsx:122-127`).

#### 2.2.4 Kept vs derived, on the device

**Kept verbatim:** name, disciplines, per-discipline levels, equipment ids, training-day indices,
session minutes, technical-skill strings, limitation category ids + free-text note,
altitude-illness id, training-baseline id, height, birth year, body mass, sex-for-energy,
the created goal.

**Derived and then stored** (the answer that produced it is not kept):
- `experience` — collapsed from the per-discipline levels (2.5.1).
- `maxAltitudeM` — the *lower bound* of the chosen band; the band id itself is discarded
  (`Onboarding.tsx:1096`).
- `trainingIntent` / `sessionGoal` — inferred, never asked (2.5.2).

**Given and kept nowhere on the device:** `gender`, `heardAbout`, and every flag in
`OnboardingDeclined`. They exist only inside the `answers` jsonb on the server.

---

### 2.3 THE SERVER MODEL

#### 2.3.1 `public.athlete_profiles` — created `20260830100000_identity_username_location.sql:147-181`

```
id                  uuid primary key references public.profiles(id) on delete cascade
experience          text
body_mass_kg        numeric(5,2)
height_cm           smallint
birth_year          smallint
typical_session_min smallint
training_days       smallint[] not null default '{}'   -- 0 = Sunday
max_altitude_m      integer
answers             jsonb    not null default '{}'::jsonb
answers_version     smallint not null default 1
onboarded_at        timestamptz
created_at          timestamptz not null default now()
updated_at          timestamptz not null default now()
```

CHECK constraints (`:169-180`):
`body_mass_kg is null or (body_mass_kg > 20 and body_mass_kg < 400)`;
`height_cm is null or (height_cm between 50 and 260)`;
`birth_year is null or (birth_year between 1900 and extract(year from now())::int)`;
`typical_session_min is null or (typical_session_min between 1 and 1440)`;
`max_altitude_m is null or (max_altitude_m between 0 and 9000)`;
`training_days <@ array[0,1,2,3,4,5,6]::smallint[]`.

RLS: enabled `:183`. `athlete_profiles_select` = `id = (select auth.uid()) or public.is_admin()`
(`:186-189`); insert/update `with check (id = (select auth.uid()))` (`:191-200`);
`grant select, insert, update … to authenticated` (`:202`); `updated_at` trigger (`:204-206`).

**Six of those typed columns are dead.** Re-verified column by column in the verification pass:
`body_mass_kg` (declared `20260830100000_identity_username_location.sql:153`), `height_cm` (`:154`),
`birth_year` (`:155`), `typical_session_min` (`:156`), `training_days` (`:157`), `max_altitude_m`
(`:158`). A `grep -rn` per column over `icefall-app/src` returns, in total, six lines in
`icefall-app/src/backend/types.ts:99-104` (the `AthleteProfile` type) and one prose comment at
`icefall-app/src/social/publicProfile.ts:49`. **No query in `src` writes or reads any of them.**
Every one of those answers is device-only. (The first draft cited the declaration lines as
`:150-156`; the correct range is `:153-158`.)

#### 2.3.2 Columns added by `20260903040000_gender_and_heard_about.sql`

- `gender text` (`:177`); CHECK `gender is null or gender in ('woman','man','non-binary','prefer-not-to-say')` (`:262-265`).
  Column comment (`:267-272`) states "Read by nothing in ICEFALL." — verified true: the only
  `gender` references in `src` are the write path in `settings/sync.ts` and the local type.
- `sex_at_birth text` (`:420`); CHECK `sex_at_birth is null or sex_at_birth in ('female','male','prefer-not-to-say')` (`:422-425`).
  Column comment (`:427-441`) says "WRITE-ONLY TODAY: no client query reads this column back" —
  verified true.
- `heard_about text` (`:699`); FOREIGN KEY to `public.heard_about_channels (slug)`
  `on update cascade on delete restrict` (`:701-705`).
- `public.heard_about_channels` (`:484-…`), seeded `:586-599` with slug/label pairs, verbatim:
  `('friend','A friend, or someone I climb with')`,
  `('guide-or-operator','A guide, a club, or an expedition company')`,
  `('instagram','Instagram')`, `('youtube','YouTube')`, `('tiktok','TikTok')`,
  `('reddit','Reddit')`, `('podcast','A podcast')`, `('search','A search engine')`,
  `('article','A blog, forum, or news article')`, `('somewhere-else','Somewhere else')`,
  `('dont-remember','I don''t remember')`, `('prefer-not-to-say','Prefer not to say')`.
- `public.heard_about_tally()` (`:782-816`), admin-only. **Not called from the app** — grep for
  `heard_about_tally` in `src` returns one comment in `settings/sync.ts:200` and nothing else.

`20260907150000_consent_route_onboarding.sql` — despite the filename, adds **no onboarding
column**: it widens the `route` CHECK on `public.health_consent_events` (`:29-53`) so a consent
grant can be stamped as coming from the sign-up page. Not an answer store.

#### 2.3.3 LIVE vs PENDING — what the code actually claims

`settings/sync.ts` **deliberately refuses to state deployment status in a comment.** Its header,
`sync.ts:25-34`, verbatim:

> ⚠️ WHAT THIS BLOCK NO LONGER DOES IS TELL YOU WHICH ARE APPLIED. It used to
> ("NEEDS 20260903020000 — written, NOT pushed"), and it was wrong: measured
> against the live database on 2026-09-04, `profiles.bio`, `languages`,
> `interests` and `banner_url` all answer `42501 permission denied` rather than
> `42703 column does not exist`, which is PostgREST's way of saying the columns
> are there. A deployment state written into a comment is out of date the next
> time somebody runs `supabase db push`, and this one was — while the paragraph
> below still described a fault that had already been fixed. If you need to
> know what is applied, ask the database; the recipe is one curl and it is in
> the audit plan's Appendix B.

*(Re-quoted in full in the verification pass; the first draft elided the clause after "and this one was".)*

What the module encodes instead is the **dependency**, `sync.ts:36-50`:
- `NO MIGRATION NEEDED` — `display_name`, `location_label`, `country_code`, `avatar_url`.
- `NEEDS 20260903020000` — `bio`, `languages`, `interests`, `banner_url`.
- `NEEDS 20260903020000's STORAGE BLOCK`, separately skippable — the `profile-media` bucket.

That split is implemented as separate requests, one per migration, because a PostgREST UPDATE
naming a missing column writes nothing (`PGRST204`) — reasoning at `sync.ts:51-64`:
- `LIVE_COLUMNS = "display_name, location_label, country_code, avatar_url, username"` (`sync.ts:1432`)
- `PENDING_COLUMNS = "bio, languages, interests, banner_url"` (`sync.ts:1433`)
- `LINK_COLUMNS = "website, instagram, facebook, youtube, tiktok, strava"` (`sync.ts:1450`, third
  request, reasoning `sync.ts:1435-1448`)

**For the onboarding answers specifically:** `gender`, `heard_about` and `sex_at_birth` are all
treated as possibly-not-deployed. They are written through an *untyped* client
(`sync.ts:145`, reasoning `sync.ts:2475-2486`), and a "column absent" answer is detected at
runtime by `classifyBackendError` (`backend/pgErrors.ts:32`: the ABSENT set is
`PGRST205, 42P01, 42883, 42703, PGRST204, PGRST202`), producing `not-yet-on-server` at
`sync.ts:1491-1493`.

So the honest statement for the redesign is: **the code does not know, and does not claim to know,
which of these columns are live.** It probes on every write. The migration files for all of them
exist in `icefall-supabase/migrations`. Nothing in the repository records that any of them has
been pushed.

---

### 2.4 THE WRITE PATH

The whole of it is `screens/Onboarding.tsx:1080-1333` (`finish`).

#### 2.4.1 Device writes (synchronous, before any network work)

| Call | Line | What it carries |
|---|---|---|
| `updateCoachProfile({…})` | `Onboarding.tsx:1084-1097` | limitations, limitationsNote, altitudeIllness, trainingBaseline, disciplineExperience, availableEquipment, trainingDays, typicalSessionMin, technicalSkills, maxAltitudeM |
| `addGoal({…})` | `Onboarding.tsx:1140-1158` | the objective: name, subtitle, elevationM, mountainId, wikipedia, lat, lon, country, targetDate, trainingStartedAt, photo, two `gaps` strings |
| `setBodyMassKg(kg)` | `Onboarding.tsx:1247` | weight, only if `Number.isFinite(kg) && kg > 0` |
| `patchSettings({…})` | `Onboarding.tsx:1251-1271` | heightCm (undefined if declined/invalid), birthYear (undefined if declined or `year <= 1900`), trainingIntent, sessionGoal |
| `completeOnboarding(answers)` | `Onboarding.tsx:1282` | see 2.2.1 — persists four fields + goal; diverts `sexAtBirth` to the fuel record |

#### 2.4.2 Server writes (fire-and-forget, chained, `Onboarding.tsx:1327-1333`)

```
void syncOnboarding({ ...answers }).then(() => {
  void saveSignupAnswers({
    gender: gender ?? undefined,
    heardAbout: heardAbout ?? undefined,
  });
  void saveSexAtBirth({ sexAtBirth: sexAtBirth ?? undefined });
});
```

**`syncOnboarding`** — `auth/account.ts:329-349`. One upsert on `athlete_profiles`
(`onConflict: "id"`) carrying exactly:

```
id: sess.session.user.id,
experience: typeof answers.experience === "string" ? answers.experience : null,
answers,
answers_version: 1,
onboarded_at: new Date().toISOString(),
```

Errors are swallowed (`:344-348`). No `await`, no branch on the result.

**What is inside `answers`** — built at `Onboarding.tsx:1197-1228`:
`declined`, `limitations`, `limitationsNote`, `altitudeIllness`, `trainingBaseline`, `gender`,
`sexAtBirth`, `heardAbout`, `name`, `disciplines`, `experience`, and `goalName: ""`.

`goalName` is **deliberately blank** (`Onboarding.tsx:1225-1227`), so the server blob carries no
objective at all.

**Therefore, answers that never reach the server in any form:** the per-discipline experience
levels, the equipment list, the training days, the typical session length, the technical-skill
claims, the altitude band, height, birth year, body mass, and the objective (name, mountain,
elevation, target date). They exist only in `icefall.state.v1` / `icefall.settings.v1` on that
one device.

**`saveSignupAnswers`** — `settings/sync.ts:2547-2623`. UPDATE (not upsert) on
`athlete_profiles`, `.eq("id", session.uid)`, `.select("gender, heard_about")` (`:2576-2580`,
columns named at `:2514`). Result reported per field, off the read-back row (`:2600-2615`).
`interpretWrite` (`sync.ts:1484-1507`) treats a null `data` as **not a save**
(`SYNC_NO_ROW`, `sync.ts:218-219`).

**`saveSexAtBirth`** — `settings/sync.ts:2792-2852`. A second UPDATE on the same table for the
single column `sex_at_birth` (`:2810-2819`, column name at `:2766`). It is a separate function
purely for repository-mechanical reasons, stated at `sync.ts:2629-2652`.

#### 2.4.3 What happens when a column is absent

`interpretWrite` maps a `not-provisioned` classification to state `"not-yet-on-server"`
(`sync.ts:1491-1493`). Both signup writers then report `SIGNUP_ANSWER_NOT_DEPLOYED`
(`sync.ts:2619-2621`, `sync.ts:2847-2850`), verbatim (`sync.ts:204-205`):

> "ICEFALL's server has nowhere to file this answer yet, so nothing at ICEFALL can count it. It is kept with the rest of your signup answers and nothing here tries again — the column has to arrive first."

`keptOnDevice` is **false** on every failure path for signup answers (`notReached`,
`sync.ts:2534-2538`). There is no outbox for a signup answer — `flushProfile` (`sync.ts:2039`)
drains `ProfileEdit`s only, and `OUTBOX_KEY` is `icefall.profile.outbox.v1` (`sync.ts:1130`).
The reasoning is at `sync.ts:2501-2510` and `sync.ts:183-205`.

**Nothing on the signup screen reports any of this.** The three server calls at
`Onboarding.tsx:1327-1333` are `void`-ed; no result is read (comment at `:1304-1310` says so
explicitly, and the code matches).

#### 2.4.4 Device-only vs sent, summarised

| Answer | `icefall.state.v1` | `icefall.settings.v1` | `icefall.fuel.v1` | server `answers` blob | server typed column |
|---|---|---|---|---|---|
| name | ✔ `1109` | — | — | ✔ | — |
| disciplines | ✔ `1110` | — | — | ✔ | — |
| experience (derived) | ✔ `1111` | — | — | ✔ | ✔ `athlete_profiles.experience` |
| per-discipline levels | ✔ `coachProfile` | — | — | ✘ | ✘ |
| equipment | ✔ `coachProfile` | — | — | ✘ | ✘ |
| training days | ✔ `coachProfile` | — | — | ✘ | ✘ (`training_days` unused) |
| typical session min | ✔ `coachProfile` | — | — | ✘ | ✘ (`typical_session_min` unused) |
| technical skills | ✔ `coachProfile` | — | — | ✘ | ✘ |
| altitude band → `maxAltitudeM` | ✔ `coachProfile` | — | — | ✘ | ✘ (`max_altitude_m` unused) |
| limitations + note | ✔ `coachProfile` | — | — | ✔ | ✘ |
| altitude illness | ✔ `coachProfile` | — | — | ✔ | ✘ |
| training baseline | ✔ `coachProfile` | — | — | ✔ | ✘ |
| objective / timeline | ✔ `customGoals` | — | — | ✘ (`goalName: ""`) | ✘ |
| body mass | ✔ `bodyMassKg` | — | — | ✘ | ✘ (`body_mass_kg` unused) |
| height | ✘ | ✔ `heightCm` | — | ✘ | ✘ (`height_cm` unused) |
| birth year | ✘ | ✔ `birthYear` | — | ✘ | ✘ (`birth_year` unused) |
| gender | ✘ | ✘ | ✘ | ✔ | ✔ `gender` |
| sex at birth | ✘ | ✘ | ✔ (if empty) | ✔ | ✔ `sex_at_birth` |
| heard about | ✘ | ✘ | ✘ | ✔ | ✔ `heard_about` |
| the seven `declined` flags | ✘ | ✘ | ✘ | ✔ | ✘ |

#### 2.4.5 The read-back path, and what it loses

Sign-in: `screens/auth/Auth.tsx:775-786`. If `nextStepForSession()` returns `"home"`, it calls
`storedOnboarding()` (`auth/account.ts:364-379`, `select("answers, onboarded_at")`, validated by
`validAnswers` at `:397-405` which requires `name`, `experience`, `disciplines`, `goalName`) and
hands the raw jsonb straight to `completeOnboarding` (`Auth.tsx:778`).

Because `completeOnboarding` persists only four fields (2.2.1), **a second device restores name,
disciplines, experience and the sex-for-energy answer, and nothing else.** `coachProfile` is
never restored — the restored blob does contain `limitations`, `limitationsNote`,
`altitudeIllness` and `trainingBaseline`, and `completeOnboarding` drops them on the floor. The
new device's `coachProfile` stays `EMPTY_COACH_PROFILE`, so the coach context reads empty for
every train-around and skills answer. Height and birth year are likewise not restored.

`settings/hydrate.ts` does **not** fill that gap: it hydrates only profile text/pictures
(`TEXT_KEY_OF`, `hydrate.ts:215-226`: region, bio, languages, interests, website, instagram,
facebook, youtube, tiktok, strava). Its own comment at `hydrate.ts:133-143` states that
`heightCm`, `birthYear` and `ageBand` are **not** cleared on an account change — confirmed by
`DEVICE_PROFILE_FIELDS` (`hydrate.ts:229-243`), which lists only avatar, cover, username, region,
bio, languages, interests and the five link handles.

---

### 2.5 DERIVED VALUES

Everything below is computed from answers rather than asked.

#### 2.5.1 `experience` — one value from many per-discipline levels

`screens/Onboarding.tsx:1171-1173`:
```
const strongest = LEVELS.map((l) => l.id)
  .filter((id) => Object.values(levels).includes(id))
  .at(-1);
```
`LEVELS` order (`Onboarding.tsx:96-101`): `beginner`, `intermediate`, `advanced`, `expert` — so
`.at(-1)` is the highest level claimed for **any** discipline.

Mapped at `Onboarding.tsx:1224` via `LEVEL_TO_EXPERIENCE` (`Onboarding.tsx:146-151`):
```
beginner: "new", intermediate: "developing", advanced: "experienced", expert: "advanced"
```
No level claimed → `"new"` (`Onboarding.tsx:1224`).
**Output range:** `"new" | "developing" | "experienced" | "advanced"`.
Stored at `AppState.tsx:1111` and sent as `athlete_profiles.experience`
(`auth/account.ts:337`).

#### 2.5.2 `trainingIntent` / `sessionGoal` — inferred, never asked

`screens/Onboarding.tsx:1238-1244`:
```
const derivedIntent: IntentId = goalPeak
  ? "vertical"
  : disciplines.includes("trail-running")
    ? "endurance"
    : disciplines.includes("mountaineering") || disciplines.includes("ski-touring")
      ? "vertical"
      : "endurance";
```
Written to both settings keys at `Onboarding.tsx:1269-1270`. Read by
`screens/tracker/ActivitySelect.tsx:292` and `screens/tracker/LiveTracker.tsx:184`
(`settings.sessionGoal`). `trainingIntent` itself has **no reader** — grep finds only the write
and a fixture (`offline/fixtures.ts:558`).

#### 2.5.3 `maxAltitudeM` — a band collapsed to its floor

`Onboarding.tsx:1096`: `ALTITUDE_BANDS.find((b) => b.id === altitudeId)?.lowerM`.
Bands (`Onboarding.tsx:335-341`): `b0 → 0`, `b1 → 1000`, `b2 → 3000`, `b3 → 4500`, `b4 → 6000`.
Range: `0 | 1000 | 3000 | 4500 | 6000 | undefined`. The `0` case is inert downstream —
`bestAltitude` requires `> 0` (`coach/mountainReadiness.ts:798`).

#### 2.5.4 `sexTermFor` — four stored states collapsed to two, once

`AppState.tsx:167-169`:
```
export function sexTermFor(answer: SexAtBirth | undefined | null): Sex | undefined {
  return answer === "female" || answer === "male" ? answer : undefined;
}
```
Its only caller is `rememberSexForEnergyFromSignup` (`AppState.tsx:249-288`), which returns a
`SexNarrowing` (`AppState.tsx:237-247`):
`"narrowed" | "decline-recorded" | "already-answered" | "not-kept" | "not-asked"`.

#### 2.5.5 The daily energy band — the one place height / birth year / weight / sex do arithmetic

Inputs assembled at `screens/Nutrition.tsx:640-648`: `bodyMassKgSet` (from `icefall.state.v1`),
`settings.heightCm`, `settings.birthYear`, `fuel.sexForEnergy`, `fuel.dailyMovement`.

Equation selector — `coach/fuelDay.ts:484-485`:
```
heightCm !== null && ageY !== null ? "mifflin" : ageY !== null ? "schofield" : "owen"
```
- Mifflin-St Jeor (`fuelDay.ts:428-430`):
  `10*massKg + 6.25*heightCm - 5*ageY + (sex === "male" ? 5 : -161)`
- Schofield weight-only (`fuelDay.ts:440-451`), per sex and four age bands, e.g. male `<18`:
  `17.686*massKg + 658.2`; female `≥60`: `9.082*massKg + 658.5`
- Owen (`fuelDay.ts:465-467`): `male ? 879 + 10.2*massKg : 795 + 7.18*massKg`

Sex unknown → the band spans both terms (`fuelDay.ts:493-496`). Individual spread ±10%
(`RMR_INDIVIDUAL_SPREAD = 0.1`, `fuelDay.ts:290`), applied at `fuelDay.ts:499-502`.
PAL multiplier bands (`fuelDay.ts:354-359`): `seated 1.25–1.4`, `on-feet 1.4–1.55`,
`physical 1.55–1.75`, `unknown 1.25–1.75`. Rows round outward to 25 kcal (`ROW_STEP_KCAL`,
`fuelDay.ts:304`).

Note that **height and birth year are onboarding answers that only this calculation consumes**,
and the movement answer it multiplies by is asked on the Fuel screen, not at signup.

#### 2.5.6 Objective readiness — where `technicalSkills`, `maxAltitudeM`, `disciplineExperience` are consumed

`coach/mountainReadiness.ts`. Entry point takes a `selfReported` argument
(`mountainReadiness.ts:1145` declares `technicalSkills?: string[]`), and the technical dimension
is computed at `mountainReadiness.ts:1177`.

- **Technical dimension** (`mountainReadiness.ts:667-760`). Applies only when
  `assessment.band >= 3` (`:673`). With claims present:
  `score = capped((held / skills.length) * 100, SELF_REPORT_CEILING)` (`:711`), where
  `SELF_REPORT_CEILING = 80` (`:148`). A requirement is `met` only via `skillClaimed`
  (`:643-650`, case-normalised substring match either way, minimum 4 characters, `MIN_CLAIM_CHARS`
  at `:198`); it is **never** set to `false` (`:698-704`).
  With no claims but ≥3 recorded mountain days:
  `capped((ev.mountainDays / EXPOSURE_FULL_DAYS) * EXPOSURE_CEILING, EXPOSURE_CEILING)` (`:731-734`),
  `EXPOSURE_FULL_DAYS = 12` (`:138`), `EXPOSURE_CEILING = 40` (`:149`).
  Otherwise the score is `unavailable("not-reported")` (`:752`) — **null, not zero**.
- **Experience dimension** (`mountainReadiness.ts:912-…`): `disciplineExperience` is rendered as
  requirements with `met: null` and the note `` `You reported: ${value}. Self-declared, and
  recorded here as context rather than scored.` `` (`:925-929`). It is **surfaced, not scored**.
- **`bestAltitude`** (`mountainReadiness.ts:772-802`): the self-reported figure is one of three
  candidates, alongside the highest point a recorded session reached and the highest logged
  summit; it is only admitted when `typeof reportedM === "number" && Number.isFinite(reportedM)
  && reportedM > 0` (`:798`).

These are reached from screens, which pass the answers in explicitly:
`screens/growth/ReadinessResult.tsx:503-508`, `screens/coach/Progress.tsx:128-129`,
`screens/explore/GroupWorkspace.tsx:239-241`.

#### 2.5.7 The free Readiness Test writes back into the same profile

`growth/readinessTest.ts` is a **separate** ten-question funnel (questions at `:94-…`), stored
under its own key `icefall.readiness-test.v1` (`readinessTest.ts:507`).

- `coachProfilePatchFrom` (`readinessTest.ts:475-493`) returns `{ disciplineExperience, maxAltitudeM? }`.
  The `mountaineering` rung is set from the chosen option's declared `rung`, or **deleted** when
  the answer was "None yet" (`:482-485`). `maxAltitudeM` is the band's lower bound (`:487, :491`).
- Applied at `screens/growth/ReadinessTest.tsx:778`: `updateCoachProfile(coachProfilePatchFrom(answers, coachProfile))`.
  So a free test **overwrites** two onboarding answers.
- `selfReportFrom` (`readinessTest.ts:445-464`) merges test answers with the stored profile; the
  test's altitude wins over the stored one (`:460`).
- `fitnessSelfReportFrom` (`readinessTest.ts:425-435`) passes a figure only when `> 0`.
- Deliberate omissions, stated at `readinessTest.ts:20-30` and verified in the code:
  weekly ascent is not asked, and `trainingDays` is never written from the availability question.

#### 2.5.8 Derived values that are NOT built from onboarding answers

Worth stating so the redesign does not assume otherwise:

- **The daily readiness score.** `coach/readiness.ts:643-683` takes `load`, `recovery`,
  `activities`, `goalPreparation`, `plannedFocusToday`. No onboarding answer is an input. It
  renormalises over available components (`:673-681`) and returns null below `MIN_COMPONENTS`.
- **The training plan.** `tracking/training.ts:160-219` (`buildPlanForGoal`) reads only the goal
  and an optional mountain. Grep for `trainingDays` / `coachProfile` / `experience` in that file
  returns nothing. The week template is fixed. This confirms the caveat written at
  `screens/Onboarding.tsx:61-64`: `trainingDays` and `typicalSessionMin` move no session.
- **`availableEquipment` does** reach session generation, but only via one screen:
  `screens/coach/SessionDetail.tsx:242` (`statedEquipment(coachProfile.availableEquipment)`,
  helper at `:106-109`, which converts an empty list to `undefined`) → `:258`
  `buildSession({ day, goalName, equipment })` → `coach/sessions.ts:740-746`, filtered by
  `kitAvailable` (`sessions.ts:256-258`).

#### 2.5.9 `coach/context.ts` — the mid-audit edit, now settled

**RESOLVED IN THE VERIFICATION PASS.** The inconsistency reported here earlier — `useCoachContext`
setting `surveyed` on an `ObjectiveContext` that did not declare it — **no longer exists**. As read
at 00:52 on 2026-09-11, `coach/context.ts` is **454 lines** (it was 439/440 when this section was
first written) and `ObjectiveContext` declares `surveyed: boolean` at `coach/context.ts:81`. The
write is at `coach/context.ts:188` and the source is `coach/hooks.ts:87`
(`surveyed: training.mountain !== undefined`), i.e. whether the objective resolves to one of the 14
curated mountains. The file typechecks as written.

**Current line numbers in that file, re-read:** `ObjectiveContext` `:70-82`; `useCoachContext`
`:143`; `describeAthlete` `:250-286`; `describeState` `:289-381`; `limitationsBlock` `:405-432`
(the free-text note is interpolated at `:412`, not `:398`); `systemPromptFor` `:434-454`. Every
`context.ts` line number elsewhere in this section is from the earlier revision — search for the
identifier rather than trusting the number.

⚠️ **The coach files are being edited live.** Modification times at 00:52 on 2026-09-11:
`coach/hooks.ts` 00:29, `coach/context.ts` 00:30, `screens/coach/Today.tsx` 00:33,
`screens/coach/CoachHub.tsx` 00:38, `screens/CoachChat.tsx` 00:46, `screens/coach/Plan.tsx` 00:47.
`screens/CoachChat.tsx` grew from 415 to 444 lines during the verification pass itself. None of the
observed edits changes where an onboarding answer is stored or read, and `services/coach.ts`
(2026-08-31) was not touched.

---

### 2.6 HOW THE ANSWERS REACH THE AI

**Answer: both paths exist in code, but the AI path is unreachable in this build. Today the
answers reach rule-based code only, and one of the two rule-based coaches ignores them entirely.**

#### 2.6.1 The prompt path — real code, dead gate

1. `useCoachContext()` (`coach/context.ts:136-225`) copies the stored answers into
   `AthleteProfileContext` at `:145-172`: `disciplineExperience`, `availableEquipment`,
   `trainingDays`, `typicalSessionMin`, `technicalSkills`, `maxAltitudeM`, `limitations`,
   `limitationsNote`, `altitudeIllness`, `trainingBaseline`, plus `bodyMassKgSet` at `:171`.
2. `describeAthlete(ctx)` (`coach/context.ts:243-279`) renders them as prose lines — e.g.
   `` `Experience per discipline (self-reported): ${…}` `` (`:253-257`),
   `` `Technical skills claimed (self-reported, NEVER inferred): ${…}` `` (`:258-262`),
   `` `Highest altitude actually reached (self-reported): …` `` (`:263`),
   `` `Equipment available: …` `` (`:264-266`), `` `Days they can train: …` `` (`:267-271`),
   `` `Typical session length: ${a.typicalSessionMin} min` `` (`:272`),
   `` `Body mass: …` `` (`:273`), `` `Currently training: …` `` (`:276`).
   Absences are printed as `"not given"` / `"not set"` (`or`, `:234-235`).
3. `limitationsBlock(ctx)` (`coach/context.ts:391-418`) injects the train-around answers,
   including the free-text note **verbatim inside quotes** (`:398`:
   `` `\nTheir own words, verbatim: "${ctx.athlete.limitationsNote}"` ``), and the altitude-illness
   answer when it is `"serious"` or `"mild"` (`:402-406`).
4. `systemPromptFor(ctx)` (`coach/context.ts:420-440`) assembles
   `WHO YOU ARE TALKING TO` + `describeAthlete` / `WHAT ICEFALL HAS MEASURED` + `describeState` /
   `HOW YOU MUST BEHAVE` + `limitationsBlock`.
5. `askCoach` (`services/coach.ts:211-280`) builds `system` at `:229-231` and POSTs it at
   `:245-259` as `{ question, system, history, model, maxTokens }`.

**The gate:** `services/coach.ts:222` — `if (ENDPOINT && !DEMO) { … }`, where
`const ENDPOINT = import.meta.env.VITE_COACH_ENDPOINT` (`services/coach.ts:28`).

`VITE_COACH_ENDPOINT` is **not set in this checkout**. `icefall-app/.env.local` defines exactly
two variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (values
[secret — not reproduced]). `icefall-app/vercel.json` sets no env. The type declaration itself
says the variable is optional and describes it as "Optional server-side coach proxy. Unset in
this build — the scripted coach runs locally." (`icefall-app/src/vite-env.d.ts:4-5`). There is no
`api/` directory in `icefall-app` and no serverless function anywhere in it.

So: **no LLM is called in this build.** `services/coach.ts:220-221` says so in its own words,
and the code matches. The model that *would* be called is `DEFAULT_COACH_MODEL =
"claude-haiku-4-5"` (`coach/budget.ts:48`), with a client-side spend estimate at
`services/coach.ts:232-242` that falls back to the scripted coach when the estimate exceeds the
remaining allowance.

#### 2.6.2 The rule-based path that actually answers — and it reads none of the answers

With `ENDPOINT` unset, every question falls through to `scripted(question, ctx)`
(`services/coach.ts:279`, implementation `:182-189`), which matches `RULES`
(`services/coach.ts:70-173`) or `FALLBACK` (`:175-180`).

I read all nine rules and the fallback. **Not one of them reads `ctx.athlete`.** They read
`c.today`, `c.weekly`, `c.objective` and `c.intel` only. Two examples: the nutrition rule
(`services/coach.ts:138-143`) returns a fixed string quoting "roughly 6–8 g per kilogram of body
weight" without reading the athlete's weight; the altitude rule (`:156-161`) returns a fixed
string without reading `altitudeIllness` or `maxAltitudeM`. The only `ctx.athlete` read in the
whole module is `ctx.athlete.firstName` in `openingMessage` (`services/coach.ts:286`).

**Consequence for the redesign:** the limitations block — the safety constraint the whole
`limitationsBlock` apparatus exists for — is enforced **only** on the model path, and the model
path never runs. A user who declares a knee injury and asks the coach a training question today
gets a canned reply that has never seen that declaration.

#### 2.6.3 Rule-based code that DOES read the answers as structured fields

- `screens/coach/SessionDetail.tsx:242, 258` → `buildSession` → equipment filtering
  (`coach/sessions.ts:256-258`). This is the one onboarding answer that changes a prescribed
  session.
- `coach/mountainReadiness.ts` technical / experience / altitude dimensions (2.5.6), reached from
  `screens/growth/ReadinessResult.tsx:503-508`, `screens/coach/Progress.tsx:128-129`,
  `screens/explore/GroupWorkspace.tsx:239-241`.
- `coach/fuelDay.ts` (2.5.5), reached from `screens/Nutrition.tsx:640-648`.
- `passport/model.ts:719, 764-766, 797, 807` — technical claims and `maxAltitudeM` feed the
  passport's `technicalLevel` / `highestAltitude`.
- `screens/tracker/ActivitySelect.tsx:292`, `screens/tracker/LiveTracker.tsx:184` — the derived
  `sessionGoal`.

#### 2.6.4 Answers that reach neither the AI nor any rule

`gender` (column comment and grep agree: read by nothing), `heardAbout` (write-only; the tally
function is never called from the app), every flag in `OnboardingDeclined` (server blob only, no
reader), `settings.ageBand`, `settings.trainingIntent`. `sex_at_birth` is read only in its local
`icefall.fuel.v1` form; the server column has no reader.

#### 2.6.5 The one prompt-injection surface worth naming

`limitationsNote` is the athlete's own free text, interpolated **unescaped and inside quotation
marks** into the system prompt at `coach/context.ts:398`. Nothing sanitises it — the value goes
`Onboarding.tsx:1086` → `coachProfile.limitationsNote` → `context.ts:158` → `:398`. Today this is
inert because no model is called, but it is a live consideration for any redesign that turns the
endpoint on.

---

### Verification pass — 2026-09-11

Every claim in this section that something EXISTS or WORKS was re-opened in the source. Corrections are marked inline. Summary:

- **CORRECTED (material):** there are **9** scripted rules, not 8 — the weather/conditions rule at `src/services/coach.ts:167-172` was missing from the table. Four of the nine carry no disclaimer, and neither does `FALLBACK`.
- **CORRECTED (material):** §3.2.4's objective prompt line is out of date. `src/coach/context.ts` was edited *during this audit* and now branches on `objective.surveyed`, adding a second line quoting `REFERENCE_NOT_ASSESSED`. The corrected templates are in §3.2.4.
- **CORRECTED:** `COACH_DISCLAIMER` renders at 17 sites across **8** files, not "10 coach screens". `OBJECTIVE_READINESS_DISCLAIMER` render lines were off by 4–86.
- **CORRECTED:** `buildPlanForGoal` is at `src/tracking/training.ts:169`, not :160. `demandFor` is at :163.
- **CORRECTED:** 69 migration files, not 68. And whether any migration is applied to the live database **cannot be determined from the repo**.
- **CORRECTED:** many `src/coach/context.ts` and `src/screens/CoachChat.tsx` line numbers (see below).
- **RE-CONFIRMED, character by character:** the system prompt (`systemPromptFor`), `limitationsBlock`, every `describeAthlete` template, `FALLBACK`, rule 4's and rule 7's full bodies, all seven `SUGGESTED_PROMPTS`, `MEDICAL_DISCLAIMER`, `GUIDE_DISCLAIMER`, the `upgradeCopy` coach title and both bodies, `BILLING_LINE`, and the `MODEL_RATES`/`DAILY_CREDITS`/`HARD_CAP_MICROS`/`MAX_REPLY_TOKENS`/`HISTORY_TURNS`/`DEFAULT_COACH_MODEL` constants. All unchanged.
- **RE-CONFIRMED, and this is the headline:** the model branch is dead. `VITE_COACH_ENDPOINT` is absent from `icefall-app/.env.local` (which declares exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — values [secret — not reproduced]) and from `vercel.json`. The compiled `askCoach` was re-extracted byte-for-byte from **both** build artefacts and is identical in each:

  `dist/assets/coach-8k75RJyC.js` and `dist-verify/assets/coach-CClCJY3H.js` —
  ``async function C(e,t,a=[],n=Number.POSITIVE_INFINITY){const o={id:`coach-${Date.now()}`,at:new Date().toISOString()};return a.slice(-6),await new Promise(i=>setTimeout(i,620)),{message:{...o,...j(e,t)},spentMicros:0,scripted:!0}}``

  `grep -c 'fetch('` returns **0** in both. `grep -c 'claude-haiku'` returns **0** in both. **In a build with that variable unset, the ICEFALL Coach is a nine-entry regex table with a 620 ms sleep. It calls no model, uses no tools, and remembers nothing.** Whether the variable is set in the Vercel deployment environment still cannot be read from here.
- **Live-edit warning:** `src/coach/hooks.ts`, `src/coach/context.ts`, `src/screens/coach/Today.tsx`, `src/screens/coach/CoachHub.tsx`, `src/screens/CoachChat.tsx` and `src/screens/coach/Plan.tsx` were all modified by another session between 00:29 and 00:47 on 2026-09-11, i.e. while this audit was being written. `src/screens/CoachChat.tsx` grew from 415 to 444 lines during the verification pass itself. The observed edits are presentational; none adds a model call, a tool, persistence, or a metering change. `src/services/coach.ts` (2026-08-31) was not touched.

---

### 3.0 Scope and file inventory

All paths below are absolute-relative to `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-app`.

Engine modules (`src/coach/`), with line counts:

| File | Lines | What it actually is |
|---|---|---|
| `src/coach/briefing.ts` | 184 | Rules. Composes readiness/recovery/load/memory into today's briefing strings. |
| `src/coach/budget.ts` | 199 | Rules. Credit + micro-dollar accounting constants and pure functions. |
| `src/coach/context.ts` | 454 | Rules. Builds `CoachContext` and serialises it into the LLM system prompt. |
| `src/coach/exercises.ts` | 1473 | Static data. A hand-written exercise library + selection helpers. |
| `src/coach/fuelDay.ts` | 1240 | Rules. Daily energy band arithmetic. |
| `src/coach/fuelRecord.ts` | 108 | localStorage writer for `icefall.fuel.v1`. |
| `src/coach/hooks.ts` | 145 | React wiring — `useCoachIntel()`. |
| `src/coach/liveCues.ts` | 216 | Rules. In-session spoken cue engine. |
| `src/coach/load.ts` | 445 | Rules. Acute/chronic training load. |
| `src/coach/memory.ts` | 217 | Rules. Six-week window comparison → trends/strengths/weaknesses/facts. |
| `src/coach/mountainReadiness.ts` | 1256 | Rules. Objective-readiness across four dimensions. |
| `src/coach/nutrition.ts` | 1740 | Rules + static food table. Fuelling guidance and meal estimation. |
| `src/coach/readiness.ts` | 716 | Rules. Daily readiness 0–100 with renormalising components. |
| `src/coach/recovery.ts` | 529 | Rules. Check-in scoring + professional-referral flags. |
| `src/coach/reviews.ts` | 676 | Rules. Weekly/monthly review stats. |
| `src/coach/sessionIntent.ts` | 275 | Static data. Intent list + hand-written session block plans. |
| `src/coach/sessions.ts` | 1712 | Rules. `TrainingDay` → concrete `CoachSession` with blocks/items. |
| `src/coach/trekSuggestions.ts` | 168 | Retrieval over the local `TREKS` array. |
| `src/coach/types.ts` | 134 | Shared types + `COACH_DISCLAIMER`. |
| `src/coach/useLiveCoach.ts` | 85 | React wiring around `speechSynthesis`. |

Chat service: `src/services/coach.ts` (287 lines; last modified 2026-08-31, unchanged during this audit).
Chat screen: `src/screens/CoachChat.tsx` (**444 lines** — 415 at the start of the verification pass and 444 forty minutes later; another session is editing it live).
Coach screens (`src/screens/coach/`), re-counted 2026-09-11 00:52: `CheckIn.tsx` 374, `CoachHub.tsx` 1211, `CoachPlan.tsx` 1290, `CoachProgress.tsx` 725, `Fuel.tsx` 590, `Plan.tsx` 329, `Progress.tsx` 342, `ReadinessScreen.tsx` 701, `RecoveryScreen.tsx` 578, `SessionDetail.tsx` 1285, `Today.tsx` 339, `details.tsx` 51, `shell.tsx` 329.

⚠️ **These files are being edited while this audit is being written.** Modification times taken at 00:52 on 2026-09-11: `coach/hooks.ts` 00:29, `coach/context.ts` 00:30, `coach/Today.tsx` 00:33, `coach/CoachHub.tsx` 00:38, `CoachChat.tsx` 00:46, `coach/Plan.tsx` 00:47. Every line number in this section was re-verified against the files as they stood at 00:52 and may already have moved; search for the quoted identifier rather than trusting the number. The edits observed were presentational (bubble styling, a `WordReveal` timing tweak dated 2026-09-11) — **none of them adds a model call, a tool, persistence, or a change to metering**, and `src/services/coach.ts` itself was not touched.

Routing (`src/App.tsx:618-650`), verbatim route table:

```
/coach            index   → CoachHub          (src/App.tsx:636)
/coach/today              → coach/Today       (src/App.tsx:637)
/coach/chat               → CoachChat         (src/App.tsx:638)
/coach/plan               → coach/Plan        (src/App.tsx:639)
/coach/plan/calendar      → details.PlanCalendar → CoachPlan  (src/App.tsx:640)
/coach/fuel               → coach/Fuel        (src/App.tsx:641)
/coach/progress           → coach/Progress    (src/App.tsx:642)
/coach/progress/history   → coach/CoachProgress (src/App.tsx:643)
/coach/readiness          → ReadinessScreen   (src/App.tsx:644)
/coach/recovery           → RecoveryScreen    (src/App.tsx:645)
/coach/check-in           → coach/CheckIn     (src/App.tsx:646)
/coach/session/:date      → SessionDetail     (src/App.tsx:647)
/coach/training           → Training          (src/App.tsx:648)
/coach/nutrition          → details.FuelDetails → screens/Nutrition (src/App.tsx:649)
```

Note the two pairs: `Plan.tsx` is the routed tab and `CoachPlan.tsx` is only reachable at `/coach/plan/calendar`; `Progress.tsx` is the routed tab and `CoachProgress.tsx` only at `/coach/progress/history`.

---

### 3.1 MODEL AND PROVIDER

**There is no live model call in a production build of this checkout.** Those are the accurate words. What runs instead is a hand-written regular-expression rule table plus a 620 ms artificial delay.

The single call site is `askCoach()` at `src/services/coach.ts:211-280`. The model path is gated:

- `src/services/coach.ts:28` — `const ENDPOINT = import.meta.env.VITE_COACH_ENDPOINT as string | undefined;`
- `src/services/coach.ts:222` — `if (ENDPOINT && !DEMO) {` — so BOTH an endpoint must be set and `DEMO` must be false.
- `src/offline/offline.ts:34` — `export const DEMO = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";`
- `src/offline/offline.ts:14` — `export const OFFLINE = import.meta.env.VITE_ICEFALL_OFFLINE === "1";`

**Is `VITE_COACH_ENDPOINT` set in this checkout?** No. The only env file present is `icefall-app/.env.local`, which contains exactly two keys — `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (values are secrets — not reproduced). There is no `.env`, `.env.production`, `.env.development` or `.env.example`. The variable is declared as optional in `src/vite-env.d.ts:5` with the comment "Unset in this build — the scripted coach runs locally", and appears in `README.md:278` only as an example line.

**Proof from the compiled bundles.** Two build outputs exist in the checkout: `dist/` (Sep 4) and `dist-verify/` (Sep 9). The compiled `askCoach` in `dist-verify/assets/coach-CClCJY3H.js` is, verbatim:

```js
async function C(e,t,a=[],n=Number.POSITIVE_INFINITY){const o={id:`coach-${Date.now()}`,at:new Date().toISOString()};return a.slice(-6),await new Promise(i=>setTimeout(i,620)),{message:{...o,...j(e,t)},spentMicros:0,scripted:!0}}
```

`dist/assets/coach-8k75RJyC.js` contains the identical body. There is no `fetch(`, no model id string, no endpoint, and no history serialisation in either bundle — Vite's dead-code elimination removed the whole `if (ENDPOINT && !DEMO)` block because `ENDPOINT` was `undefined` at build time. `grep -rlo "claude-haiku" dist dist-verify` returns nothing.

**Which model would be requested if an endpoint were set.** `src/coach/budget.ts:48` — `export const DEFAULT_COACH_MODEL: CoachModel = "claude-haiku-4-5";`. The union at `src/coach/budget.ts:28` is `"claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5"`. That model id is passed as a JSON field in the request body at `src/services/coach.ts:255` — the client does not call any provider SDK. There is no provider API client anywhere in `src/` (`grep -rniE "anthropic|openai|gpt-4|gemini|messages\.create|apiKey" src` returns only `src/auth/providers.ts:53` for a Supabase `apikey` header and the word "Anthropic" in a pricing comment at `src/coach/budget.ts:30`). There is no `api/` directory anywhere in `icefall-app` (re-checked with `find icefall-app -maxdepth 3 -type d -name api`, excluding `node_modules`: no result) and `vercel.json` contains only a SPA rewrite, with no `env` block:

```json
{
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

The Supabase side holds **three** edge-function directories — `strava/`, `watch/` and `health/` — and **none of them is a model proxy.** `health/` was created by another session *during this audit* (00:32–00:39, 2026-09-11) and cannot run at all: the four tables it queries (`health_connections`, `health_oauth_states`, `health_pending_links`, `health_webhook_events`) and the function it calls (`health_sweep_states`) exist in no migration. It is relevant here for one reason only: `health/oura.ts` records that Oura's developer agreement forbids using Oura data "to train or improve any AI model", and states that "Nothing in the code stops that today except the Coach having no model, which is not a control."

**The proxy contract, if one is ever built** (`src/services/coach.ts:245-265`): POST JSON `{ question, system, history: [{role, body}], model, maxTokens }`; the response is read as `{ body: string; disclaimer?: string; usage?: TokenUsage }`.

⚠ **`README.md:281-283` is stale and contradicts the code.** It says the proxy "receives `{ question, context }` and returns `{ body, disclaimer? }`". The code sends `question`, `system`, `history`, `model`, `maxTokens` (no `context` field) and reads `usage` as well. Do not build a proxy from the README.

**Failure behaviour.** Any non-OK status or thrown error falls through to the scripted coach with no error surfaced — `src/services/coach.ts:260` (`if (!res.ok) throw new Error(String(res.status));`) and `src/services/coach.ts:272-274` (`} catch { /* Fall through to the scripted coach rather than showing an error. */ }`).

**What actually produces a chat reply today** — `scripted()` at `src/services/coach.ts:182-189`:

```ts
function scripted(question: string, ctx: CoachContext): Omit<CoachMessage, "id" | "at"> {
  const rule = RULES.find((r) => r.match.test(question));
  return {
    role: "coach",
    body: rule ? rule.reply(ctx) : FALLBACK(ctx),
    disclaimer: rule?.disclaimer,
  };
}
```

First matching regex wins. There are **9 rules** (`src/services/coach.ts:70-173`) plus one fallback (`src/services/coach.ts:175-180`).

⚠️ **CORRECTION (verification pass).** An earlier draft of this section said 8 and its table listed 8, omitting the weather/conditions rule at `src/services/coach.ts:167-172`. Recounted by literal object braces inside `RULES`: **nine**. Section 2 of this audit says nine and is right.

---

### 3.2 EVERY SYSTEM PROMPT AND PROMPT TEMPLATE, VERBATIM

There is exactly **one** system prompt builder and **one** appended retrieval block. Neither is sent anywhere in this build (see 3.1) — both exist as source only.

#### 3.2.1 `systemPromptFor(ctx)` — `src/coach/context.ts:434-453`

*(Line numbers in `src/coach/context.ts` moved during this audit — the file was edited by another session at 00:29–00:30 on 2026-09-11 and is now 454 lines. The prompt TEXT below was re-read character by character against the current file and is unchanged.)*

The literal template (interpolations shown as they appear in the source):

```
You are the ICEFALL Coach, inside a mountaineering training app.

WHO YOU ARE TALKING TO
${describeAthlete(ctx)}

WHAT ICEFALL HAS MEASURED
${describeState(ctx)}

HOW YOU MUST BEHAVE
- Use the data above. Refer to their real sessions, numbers and objective. Never invent a figure.
- If something is "not given" or "not computable", say so and ask — do not estimate it.
- NEVER contradict the prescribed/downgraded session above.
- You are NOT a doctor. Defer anything medical (pain, injury, illness, altitude sickness,
  medication) to a doctor, and say so explicitly.
- You are NOT a guide. Defer route choice, glacier travel, avalanche and technical terrain
  judgement to a certified mountain guide. Never clear anyone as "ready" for a summit.
- Never infer technical skill or altitude experience they did not claim.
- Be concise and specific — a few short paragraphs, no lists of caveats.
- British English, plain and direct. No hype.${limitationsBlock(ctx)}
```

#### 3.2.2 `limitationsBlock(ctx)` — `src/coach/context.ts:405-431`

Returns `""` when there is nothing to constrain (`src/coach/context.ts:422`). Otherwise:

```

WHAT YOU MUST TRAIN AROUND — CONSTRAINTS, NOT A CLINICAL PICTURE
${parts.join("\n")}
- These narrow WHAT YOU MAY PRESCRIBE. They are not information about a body for you to reason about.
- Do NOT name, explain, interpret or speculate about any condition. Do not say what is wrong, whether it is improving, or when they may return to something.
- Do NOT offer reassurance about it, and do not attribute a change to it in a way that reads as medical judgement. Adjust the session and move on.
- If they ask you about the condition itself, say plainly that it is for a doctor or physiotherapist who can examine them, and answer only the training question.
```

The two possible `parts` entries (`src/coach/context.ts:410-419`):

```
`AREAS YOU MUST NOT PRESCRIBE LOAD INTO: ${named}.` + (ctx.athlete.limitationsNote ? `\nTheir own words, verbatim: "${ctx.athlete.limitationsNote}"` : "")
```

```
`They have reported ${ctx.athlete.altitudeIllness} altitude illness. Treat conservative ascent rates as the only acceptable suggestion.`
```

`named` is `ctx.athlete.limitations.join(", ")` or the literal `"none by category"` (`src/coach/context.ts:409`). The free-text note is interpolated at `src/coach/context.ts:412`.

#### 3.2.3 `describeAthlete(ctx)` — `src/coach/context.ts:250-286`

Line templates, in order (`or(v, fallback = "not given")` is defined at `src/coach/context.ts:241-242`). Re-read verbatim in the verification pass; unchanged:

```
Name: ${a.firstName}
Self-declared experience: ${or(a.experience)}
Disciplines: ${a.disciplines.length ? a.disciplines.join(", ") : "not given"}
Home base: ${or(a.homeBase)}
Experience per discipline (self-reported): ${de.length ? de.map(([k, v]) => `${k}=${v}`).join(", ") : "not given"}
Technical skills claimed (self-reported, NEVER inferred): ${a.technicalSkills.length ? a.technicalSkills.join(", ") : "none claimed"}
Highest altitude actually reached (self-reported): ${or(a.maxAltitudeM, "not given")}${a.maxAltitudeM ? " m" : ""}
Equipment available: ${a.availableEquipment.length ? a.availableEquipment.join(", ") : "not given"}
Days they can train: ${a.trainingDays.length ? a.trainingDays.map((d) => DAY_NAMES[d]).join(", ") : "not given"}
Typical session length: ${a.typicalSessionMin} min
Body mass: ${or(a.bodyMassKg, "not set")}${a.bodyMassKg ? " kg" : ""}
Currently training: ${or(a.trainingBaseline, "not given")}
```

#### 3.2.4 `describeState(ctx)` — `src/coach/context.ts:289-381`

Line templates, in the order they are pushed:

⚠ **CORRECTED IN THE VERIFICATION PASS — the objective line is no longer what the first draft printed.** `src/coach/context.ts` gained a `surveyed` branch during this audit. As read at `src/coach/context.ts:293-306`, the objective lines are:

```
Objective: ${objective.name}${objective.elevationM ? ` (${objective.elevationM} m)` : ""}, ${objective.daysAway === null ? "date unknown" : `${objective.daysAway} days away`}, ${objective.surveyed ? `preparation ${objective.preparationPct}%` : `training plan ${objective.preparationPct}% complete (plan completion, NOT readiness)`}${objective.block ? `, training block ${objective.block} (week ${objective.weekIndex})` : ""}
```

and, when `!objective.surveyed`, a second line is pushed (`src/coach/context.ts:305`):

```
Objective tier: reference entry. ${REFERENCE_NOT_ASSESSED}
```

where `REFERENCE_NOT_ASSESSED` (`src/services/peakTier.ts:165-166`) is, verbatim:

> "ICEFALL has not surveyed this peak. It holds no grade, no kit list and no readiness judgement for it, and cannot say which part of your preparation is the thin one — that is a question for a current guidebook and the local guides office."

`objective.surveyed` is set from `training.mountain !== undefined` (`src/coach/hooks.ts:87`), i.e. whether the objective resolves to one of the 14 curated mountains.

With no objective at all (`src/coach/context.ts:308`):
```
Objective: none set.
```

```
This week: ${weekly.activities} activities, ${weekly.distanceKm.toFixed(1)} km, ${Math.round(weekly.elevationM)} m ascent, ${weekly.timeHours.toFixed(1)} h.
```

```
Readiness: NOT COMPUTABLE today (${intel.readiness.missing.join("; ") || "insufficient data"}). Do not state a readiness number.
```
or
```
Readiness: ${Math.round(r)}/100. ${intel.readiness.guidance}
```

```
Recovery: ${intel.recovery.summary ?? "unknown"}
```

```
Training load: not yet computable (not enough recorded history).
```
or
```
Training load: acute ${Math.round(acute)}, chronic ${Math.round(chronic)}${intel.load.ratio !== null ? `, ratio ${intel.load.ratio.toFixed(2)}` : ""}${intel.load.caution ? ` — CAUTION: ${intel.load.caution}` : ""}
```

```
Prescribed today: ${today.session.title} (focus ${today.session.focus}, difficulty ${today.session.difficulty}/5).
```
or
```
Prescribed today: nothing — treat as recovery.
```

```
IMPORTANT — ICEFALL has ALREADY downgraded today to: ${today.briefingTraining}. Do NOT tell them to train hard today. Reinforce the easier session.
```

```
Today's check-in: ${JSON.stringify(today.checkIn)}
```
or
```
Today's check-in: not done. Recovery is therefore partly unknown.
```

```
Known facts: ${intel.memory.facts.join(" ")}
Recent activities: <up to 5, each> ${a.title} (${a.startedAt.slice(0, 10)}, ${a.distanceKm.toFixed(1)} km, ${a.elevationGainM} m, ${a.movingMin} min)
COLD START: fewer than 3 real activities recorded. Say plainly that there is not yet enough history, and ask rather than assert.
```

⚠ Note `src/coach/context.ts:354` serialises the whole check-in object with `JSON.stringify` — raw `{date, energy, soreness, sleep, stress, motivation}` — rather than prose.

#### 3.2.5 The trek retrieval block — `trekContextBlock()` at `src/coach/trekSuggestions.ts:117-137`

Appended to the system prompt only when `isTrekQuestion(question)` is true (`src/services/coach.ts:229-231`).

Empty-shortlist form:

```
TREKS ICEFALL HOLDS NEAR THEIR OBJECTIVE
None. ${s.objectiveName ? `ICEFALL's trek catalogue has nothing linked to ${s.objectiveName} or its country.` : "They have no objective set, so there is no 'near' to search."}
- If asked for trek suggestions, say exactly that and point them to Explore → Treks to browse the full catalogue.
- NEVER name a trek that is not in a list provided to you. No exceptions.
```

Populated form:

```
TREKS ICEFALL HOLDS NEAR THEIR OBJECTIVE (${s.objectiveName} — matched by ${s.basis})
${s.treks.map(trekLine).join("\n")}

- These are the ONLY treks you may suggest or name. They come from ICEFALL's own records.
- Relay durations, difficulty and season exactly as written above — never adjust them.
- Whether a trek suits their fitness is not established by this list; say the difficulty and let them judge, or defer to a guide.
```

`trekLine` (`src/coach/trekSuggestions.ts:100-108`) emits `- ${t.name} (${t.country}): ${parts.join(" · ")}. ${t.summary}`.

Retrieval is capped at 5 (`MAX_SUGGESTIONS = 5`, `src/coach/trekSuggestions.ts:46`) and matches band 1 = treks whose `mountainIds` include the objective's mountain, band 2 = same country by token intersection (`src/coach/trekSuggestions.ts:66-75`). If the objective name does not match a `MOUNTAINS` entry exactly (case-insensitive), the result is empty with `basis: null` (`src/coach/trekSuggestions.ts:59-64`).

The trek-question detector, verbatim (`src/coach/trekSuggestions.ts:92-93`):

```ts
export const TREK_QUESTION =
  /\btrek|trekking|hut.to.hut|multi.?day (hike|walk)|long.distance (walk|trail|path)\b/i;
```

#### 3.2.6 There are no other prompts

No other system prompt, few-shot template, or model instruction string exists anywhere in `src/`. `systemPromptFor` is referenced only at `src/services/coach.ts:2` and `:230-231`. Re-confirmed in the verification pass.

---

### 3.3 WHAT THE COACH CAN PRODUCE TODAY

Everything below is **generated by rules** — deterministic TypeScript. Nothing in this build is generated by a model.

#### 3.3.1 Chat replies — `src/services/coach.ts`

Output shape: `AskResult` (`src/services/coach.ts:191-197`):

```ts
export interface AskResult {
  message: CoachMessage;
  /** What this exchange cost, in micro-dollars. 0 when nothing was billed. */
  spentMicros: number;
  /** True when the model was skipped and the scripted coach answered instead. */
  scripted: boolean;
}
```

`CoachMessage` carries `{ id, role, body, at, disclaimer? }` (used at `src/services/coach.ts:217`, `:267`, `:282-287`; rendered at `src/screens/CoachChat.tsx:376-386`).

The 8 rules, by regex, with the reply source (`src/services/coach.ts:70-173`):

| # | Line | Regex | Reply source |
|---|---|---|---|
| 1 | :74-77 | `TREK_QUESTION` | `scriptedTrekReply(c.objective?.name)` — retrieval over `TREKS` |
| 2 | :79 | `/what should i train\|train today\|session today\|workout today/i` | Reads `c.today.easeOff`, `c.today.session`, `FOCUS_GUIDANCE[focus]`, weekly totals |
| 3 | :103 | `/ready for\|am i prepared\|prepared for/i` | Reads `c.objective`, `c.intel.readiness`, `c.intel.memory.strengths/weaknesses` |
| 4 | :138 | `/\beat(ing)?\b\|nutrition\|\bfood\b\|\bfuel(ling\|s)?\b\|\bcarb/i` | Fixed string (no athlete data) |
| 5 | :145 | `/fatigue\|tired\|exhausted\|recover\|sleep\|heavy legs/i` | Weekly totals only |
| 6 | :151 | `/gear\|equipment\|kit\|wear\|jacket\|boots\|layer/i` | `c.objective?.name` only |
| 7 | :156 | `/altitude\|acclimat\|oxygen\|thin air\|hypox/i` | Fixed string |
| 8 | :163 | `/increase\|more volume\|harder\|\bpush\b\|add training\|\bramp(ing\|s)?\b/i` | Weekly totals only |
| 9 | :168 | `/weather\|conditions\|forecast\|window/i` | Fixed string (no athlete data). Carries `GUIDE_DISCLAIMER` (`:171`) |

Verbatim examples worth having in front of a redesigner:

`FALLBACK` (`src/services/coach.ts:175-180`):
```
I can answer questions about training, fuelling, recovery, gear, altitude and conditions — read against your own recorded activity.

${where}

Try: what should I train today, am I ready for my objective, what should I eat before a long day, or why am I so tired.
```
where `${where}` is either `Right now you are ${c.objective.preparationPct}% prepared for ${c.objective.name}.` or `You have not set an objective yet, so there is nothing for me to measure you against.`

Rule 4's whole body (`src/services/coach.ts:140`) — note it uses **no** athlete data at all, not even body mass:
```
For a long ascent tomorrow, shift today's balance toward carbohydrate — roughly 6–8 g per kilogram of body weight across the day, weighted to the evening meal.

On the hill, aim for 60–90 g of carbohydrate per hour once you pass the two-hour mark, and start drinking before you feel thirsty. Test the exact foods on a training day, never for the first time on the objective.
```

Rule 7's whole body (`src/services/coach.ts:158`):
```
Altitude is earned slowly. Above 3,000 m, raise your sleeping altitude by no more than 300–500 m per night and build in a rest day every third or fourth.

Climb high, sleep low is still the most reliable pattern. Know the symptoms of acute mountain sickness and treat descent as the answer rather than the failure — going down early is the decision that keeps the objective available next season.
```

`FOCUS_GUIDANCE` (`src/services/coach.ts:33-47`) is a 7-key `Record<string, string>` keyed by focus (`recovery`, `endurance`, `strength`, `intervals`, `long-mountain`, `rest`, `technical`). It is consumed by chat rule 2 (`src/services/coach.ts:99`) **and** by `CoachPlan.tsx:515` — the only two consumers. `CoachHub.tsx:904-906` explicitly refuses to use it.

`SUGGESTED_PROMPTS` (`src/services/coach.ts:49-57`), verbatim, in order:
```
"What should I train today?",
"Am I ready for Mont Blanc?",
"What should I eat before tomorrow's hike?",
"Why am I feeling fatigued?",
"What gear do I need?",
"How should I prepare for altitude?",
"Can I increase my training this week?",
```
⚠ `"Am I ready for Mont Blanc?"` is a hard-coded mountain name in the chip row at `src/screens/CoachChat.tsx:270-280`. The hub's own chips (`src/screens/coach/CoachHub.tsx:408-412`) substitute the real goal name instead:
```ts
const chips = [
  "What should I train today?",
  goal ? `Am I ready for ${goal.name}?` : "Am I prepared?",
  "Why am I feeling fatigued?",
];
```

`openingMessage` (`src/services/coach.ts:282-287`) is **exported but never called**. `grep -rn "openingMessage" src` returns only its definition and a comment about it in `src/screens/CoachChat.tsx:46`. It is dead code.

#### 3.3.2 Training plans

Not produced by `src/coach/`. The plan is generated deterministically by `buildPlanForGoal(goal, mountain, now)` at **`src/tracking/training.ts:169`** (corrected — the first draft said :160), from hand-written week templates (`weekTemplate` at `src/tracking/training.ts:51`) scaled by `load` (block phase) and `demand` (`demandFor`, `src/tracking/training.ts:163`). Re-confirmed in the verification pass: a grep of that whole file for `coachProfile`, `trainingDays`, `typicalSessionMin` and `experience` returns **nothing** — the plan generator cannot see any onboarding answer except the goal itself. Output type `TrainingPlan` → `TrainingWeek[]` → `TrainingDay[]`. Bounds `MIN_WEEKS = 8`, `MAX_WEEKS = 52` (`src/tracking/training.ts:28-29`). Phase families are Base → Build → Peak → Taper (`src/tracking/training.ts:129`).

`src/coach/sessions.ts` then turns one `TrainingDay` into a doable session. `buildSession` (`src/coach/sessions.ts:740`) returns `CoachSession` (`src/coach/sessions.ts:73-84`):

```ts
export interface CoachSession {
  id: string;
  title: string;
  focus: TrainingFocus;
  durationMin: number;
  purpose: string;
  targets: { label: string; value: string }[];
  blocks: SessionBlock[];
  cautions: string[];
  /** True for a rest day, so the UI shows rest rather than a token workout. */
  isRest: boolean;
}
```

`modifySession` (`src/coach/sessions.ts:1698`) applies a `Modification` (`src/coach/sessions.ts:86-90`): `{kind:"time",minutes}`, `{kind:"equipment",equipment}`, `{kind:"discomfort",area}`, `{kind:"fatigue"}`. Rendered at `/coach/session/:date` by `src/screens/coach/SessionDetail.tsx` (imports at `:27-35`).

Exercises come from a static array — `EXERCISES` at `src/coach/exercises.ts:1372`, selected by `exercisesFor` (`:1404`) and `substitute` (`:1443`). No generation.

#### 3.3.3 Nutrition / fuelling

Two separate rule engines.

`fuellingFor(args)` — `src/coach/nutrition.ts:144-334`. Returns `FuellingPlan` (`src/coach/nutrition.ts:66-79`):

```ts
export interface FuellingPlan {
  /** What this guidance was built from, including when that was very little. */
  context: string;
  before: string[];
  during: string[];
  after: string[];
  hydration: string[];
  emphasis: string | null;
}
```

Branch thresholds are constants: `NO_FUEL_NEEDED_MIN = 75`, `SUSTAINED_MIN = 150`, `LONG_DAY_MIN = 240`, `ALTITUDE_NOTABLE_M = 2_500`, `ALTITUDE_HIGH_M = 3_500` (`src/coach/nutrition.ts:86-95`). Body mass is only used when plausible — `MIN_PLAUSIBLE_MASS_KG = 30` / `MAX_PLAUSIBLE_MASS_KG = 250` (`:98-99`, `usableMass` at `:108`). With no usable mass, gram figures are withheld and the copy says so, e.g. `src/coach/nutrition.ts:269`: `"Protein within a couple of hours — a palm-sized portion is the usual shorthand. No gram figure is given because there is no usable body mass on your profile."`

`estimateFromEntry(entry)` — `src/coach/nutrition.ts:1505`. Returns `MealEstimate` (`:1217`). It is a **string matcher over a hand-written `FOODS` table** (`src/coach/nutrition.ts:372-1182`) with alias regexes (`ALIAS_PATTERNS`, `:1245`), quantity parsing (`quantityBefore`, `:1288`), negation handling (`NEGATION_RE`, `:1358`), alcohol terms (`:1191`), and declared-macro reading (`readDeclared`, `:1466`). kcal is derived with Atwater factors 4/4/9 (`:1209-1211`) only when all three macros are present (`deriveKcal`, `:1482`). No model, no vision. `IMAGE_ANALYSIS_NOTE` (`src/coach/nutrition.ts:59-60`) states this explicitly and is rendered at `src/screens/Nutrition.tsx:1340`.

Daily energy: `dailyEnergyFor(input)` — `src/coach/fuelDay.ts:805`. Returns `DailyEnergy` (`:157`) whose `total` is a `Band {low, high}` (`:79`), not a single number. `stillToCover(total, loggedKcal)` (`:975`) returns `{ kcal: number } | "inside-range" | null` (`StillToCover`, `:239`). Rendered on `/coach/fuel` at `src/screens/coach/Fuel.tsx:177-201` and `:337-419`.

⚠ **The Fuel screen's "target" selector changes no number.** `TARGETS` (`src/screens/coach/Fuel.tsx:68-96`) is three copy blocks; `t.emphasis` is pasted into a chip at `Fuel.tsx:474-477` and `t.description` into a paragraph at `:290`. The screen says so itself at `Fuel.tsx:312-315`: `"A target changes the guidance below, not the range: the range is worked out from your body and today's session, and ICEFALL sets no weight or body-composition goals."` The choice persists in `localStorage` under `"icefall.fuel-target.v1"` (`Fuel.tsx:98`, `:106-126`).

⚠ Macro tiles have **no targets** — `Fuel.tsx:425-432`; the caption is `"Grams logged today, from the same estimates. ICEFALL prescribes no macro split, so there is no target to fill towards."`

#### 3.3.4 Readiness (daily)

`computeReadiness(args)` — `src/coach/readiness.ts:643-699`. Returns `Readiness` (`:31-41`):

```ts
export interface Readiness {
  /** 0..100, null when too little is known. */
  score: Score;
  components: Component[];
  /** One paragraph explaining the number in plain language. */
  explanation: string;
  /** What today's session should look like given the score. */
  guidance: string;
  /** Labels of components that could not be computed, so the UI can say so. */
  missing: string[];
}
```

Four components with weights `training: 0.3, recovery: 0.3, consistency: 0.2, "goal-alignment": 0.2` (`src/coach/readiness.ts:87-92`). `MIN_COMPONENTS = 3` (`:95`) — with fewer than three computable, `score` is `unavailable(...)` rather than a number (`:670-671`). Weights renormalise over survivors (`:673-682`).

`buildGuidance` (`src/coach/readiness.ts:538-637`) is ordered by consequence with early returns: (0) professional referral, (1) poor recovery, (2) load spike, (3) hard session <24 h ago, (4) no score, (5) score bands 75/55/40. `readinessWord(score)` (`:710-716`) maps to `"Strong" | "Ready" | "Moderate" | "Easy" | "Rest"`.

Rendered on `/coach/readiness` (`src/screens/coach/ReadinessScreen.tsx`). The screen recomputes historical readiness per day for a 7- and 28-day trend at `ReadinessScreen.tsx:124-166`.

#### 3.3.5 Objective readiness (per mountain)

`assessObjectiveReadiness(args)` — `src/coach/mountainReadiness.ts:1140-1256`. Returns `ObjectiveReadiness` (`:93`) with `{ overall, dimensions, biggestGap, professionalAdvice, disclaimer }`; the `disclaimer` field is set to `OBJECTIVE_READINESS_DISCLAIMER` at `:1254`. Four dimensions: `"fitness" | "technical" | "altitude" | "experience"` (`:51`). Rules-based arithmetic over recorded activities, logged summits and self-reported skills (`:1169-1180`). Consumed on `/coach/progress` at `src/screens/coach/Progress.tsx:7`.

#### 3.3.6 Recovery / check-in interpretation

`assessRecovery(args)` — `src/coach/recovery.ts:184-400`. Returns `RecoveryAssessment` (`:61-76`) with `status`, `score`, `inputs[]`, `summary`, `recommendations[]`, `reportedCount`, `flagForProfessional`, `flagReason?`.

Weights (`src/coach/recovery.ts:95-104`): `energy 0.24, soreness 0.22, sleep 0.14, stress 0.1, motivation 0.08, sleepDuration 0.1, loadRatio 0.07, hardSession 0.05`. Bands `GOOD_AT = 70`, `MODERATE_AT = 45` (`:112-113`).

Two guards worth noting for a redesign:
- **A score is withheld unless at least one self-reported input scored** — `src/coach/recovery.ts:307-317`; the comment at `:302-306` explains the "confident 100 / Good from silence" failure it prevents.
- **Resting heart rate is shown but never scored** — `src/coach/recovery.ts:243-250` sets `unit: null, weight: 0`.

`summary` and `recommendations` are assembled by `buildSummary` (`:406-457`) and `buildRecommendations` (`:459-528`) — fixed sentences chosen by status plus additive clauses.

#### 3.3.7 The daily briefing

`buildBriefing(args)` — `src/coach/briefing.ts:40-129`. Returns `Briefing` (`:17-27`) with `greeting`, `status`, `training`, `recovery`, `nutrition`, `goalProgress`, `note`.

The ease-off decision (`src/coach/briefing.ts:58-61`):
```ts
const easeOff =
  recovery.status === "poor" ||
  load.trend === "spike" ||
  (score !== null && score < LOW_READINESS);
```
`LOW_READINESS = 50` (`:32`); `HARD_FOCUS = ["intervals", "long-mountain", "strength"]` (`:29`). When `easeOff && plannedHard`, `training` is replaced with `{ title: "Easy session or rest", detail: …, focus: "recovery" }` (`:85-89`).

`briefing.note` is what the Today page quotes as "Coach note" (`src/screens/coach/Today.tsx:309-311`).

#### 3.3.8 Memory / trends

`buildMemory(args)` — `src/coach/memory.ts:113-216`. Returns `CoachMemory` (`:25-31`) with `trends[]`, `strengths[]`, `weaknesses[]`, `facts[]`. Compares two consecutive 6-week windows (`WINDOW_WEEKS = 6`, `:33`); needs ≥3 sessions in **both** windows (`MIN_PER_WINDOW = 3`, `:37`) and a ≥15% change (`MEANINGFUL_CHANGE = 0.15`, `:40`) before calling anything improving/declining. Four trends: `vertical`, `duration`, `distance`, `frequency` (`:133-166`).

#### 3.3.9 Training load

`computeTrainingLoad(acts, now)` — `src/coach/load.ts:272`. Returns `TrainingLoad` (`:221`) with acute/chronic/ratio/trend/caution. Thresholds `SPIKE_RATIO = 1.5`, `RAMPING_RATIO = 1.15`, `DETRAINING_RATIO = 0.8`, `MIN_DAYS_FOR_RATIO = 14` (`:41-57`). `IntensitySource = "heart-rate" | "activity-type"` (`:115`).

#### 3.3.10 Reviews

`weeklyReview(acts, now)` / `monthlyReview(acts, now)` — `src/coach/reviews.ts:669` and `:674`. Return `Review` (`:41`) with `ReviewStat[]` (`:34`). Rendered on `/coach/progress/history` (`src/screens/coach/CoachProgress.tsx:11`).

#### 3.3.11 Live in-session voice coach

`nextCue(snapshot, intent, activity, state)` — `src/coach/liveCues.ts:97-201`. A pure rules function returning `{ cue: Cue | null; state: CueState }`. `Cue` is `{ id, say, why }` (`:29-36`).

`src/coach/liveCues.ts:7-15` states it in as many words: *"IT USES NO AI, AND THAT IS A DESIGN DECISION, NOT A COMPROMISE."* I verified the body: it is arithmetic on `snapshot.paceSecPerKm` vs a baseline captured after `WARMUP_MS = 4 * 60_000` (`:64`, `:108-118`), with `DRIFT = 0.12` (`:86`), `MIN_GAP_MS = 60_000` (`:66`), `REPEAT_GAP_MS = 4 * 60_000` (`:68`), `MAX_REPEATS = 3` (`:78`).

The complete cue vocabulary (`src/coach/liveCues.ts:140-215`):
```
`${km} kilometre${km === 1 ? "" : "s"}.`
`${ascent100 * 100} metres climbed.`
"Ease off. This is meant to be easy."           (default)
"Pick it up — you have drifted off your pace."
"Ease off — settle back into a rhythm you can hold to the top."
SAY_EASE = {
  "fat-burn": "Ease off. Long and easy — you should be able to talk.",
  endurance: "Ease off. Save it — this is a long one.",
  recovery: "Slow down. This one is meant to feel like less than enough.",
  vertical: "Ease off. Find a rhythm you can hold all the way up.",
}
```

Speech is `window.speechSynthesis` on-device — `src/coach/useLiveCoach.ts:42-55`. Consumed only by `src/screens/tracker/LiveTracker.tsx:25` and `:185`. `src/coach/useLiveCoach.ts:14-19` records that music ducking is **not possible** on the web.

#### 3.3.12 Session intents

`SESSION_INTENTS` (`src/coach/sessionIntent.ts:55`) and `planFor(intent, activity)` (`:159`) → `SessionPlan` (`:128`) of hand-written `PlanBlock`s (`:120`). Consumed by `src/screens/tracker/ActivitySelect.tsx:293` and `src/screens/Onboarding.tsx:47`.

---

### 3.4 MEMORY — what persists between conversations

**The chat transcript is component state and is lost on navigation.** `src/screens/CoachChat.tsx:65`:

```ts
const [messages, setMessages] = useState<CoachMessage[]>([]);
```

There is no persistence of `messages` anywhere: no `localStorage` write, no context, no store, no Supabase table. Navigating away from `/coach/chat` unmounts the screen and the conversation is gone. The screen opens empty by design — `src/screens/CoachChat.tsx:42-64` documents the removal of the seeded opening turn; the intro card at `:221-235` is explicitly "not in the transcript" and "not sent to the model".

**History sent per request:** `HISTORY_TURNS = 6` (`src/coach/budget.ts:96`), applied at `src/services/coach.ts:218` — `const recent = history.slice(-HISTORY_TURNS);`. That is 6 *messages* (the slice is over the flat `CoachMessage[]`, both roles mixed), not 6 exchanges. In the compiled bundle the slice result is discarded entirely (`a.slice(-6),` as an expression statement) because the model branch was eliminated — so today **zero** history reaches anything.

**What does persist**, all in `localStorage` under one key `"icefall.state.v1"` (`src/state/AppState.tsx:33`, written at `:966`):

| Field | Where | Notes |
|---|---|---|
| `checkIns` | `src/state/AppState.tsx:1347`, saved at `:1359-1365` | Capped at 180 entries (`.slice(0, 180)` at `:1363`). One per local date. |
| `coachProfile` | `src/state/AppState.tsx:1367-1370`, `updateCoachProfile` at `:1389` | Onboarding answers: disciplines, equipment, training days, technical skills, max altitude, limitations, altitude illness, training baseline. |
| `coachUsage` | `src/state/AppState.tsx:1315-1319` | `{ month, count }` — the free-tier monthly counter. |
| `coachBudget` | `src/state/AppState.tsx:1372`, `recordCoachSpend` at `:1374-1387` | `BudgetState { creditsUsed, day, spentMicros, period }` (`src/coach/budget.ts:117-126`). |

Fuel answers live in a second key `"icefall.fuel.v1"` (`src/coach/fuelRecord.ts:29`) and the Fuel target in a third, `"icefall.fuel-target.v1"` (`src/screens/coach/Fuel.tsx:98`).

**Nothing coach-related is in Supabase.** `grep -rniE "coach|check_in|checkin" /Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-supabase/migrations` returns only comment text (e.g. `20260903070000_oura_health_hardening.sql:272`, `20260903060000_oura_health.sql:136`) — no table, column or RPC for check-ins, coach conversations, readiness or fuelling exists in any of the **69** migration files (recounted: `ls -1 … | wc -l` = 69, all `.sql`; the first draft said 68).

**Whether any of those 69 migrations is applied to the live Supabase project cannot be determined from this repository.** Nothing in the repo records a deployment state; `icefall-app/src/settings/sync.ts:25-34` argues explicitly that a deployment state written into a comment is unreliable and was wrong the last time it was tried. For the coach specifically this is moot in one direction — there is no coach table in any migration, applied or not — but it matters for any redesign that plans to store conversations server-side.

**The "six-week memory" is not stored memory.** `buildMemory` (`src/coach/memory.ts:113`) recomputes trends from recorded activities on every render of `useCoachIntel` (`src/coach/hooks.ts:85-88`). Nothing is remembered *about the conversation*; it is a derived summary of activity.

---

### 3.5 TOOLS / FUNCTION CALLS

**None.** There is no tool/function-calling machinery of any kind. The request body at `src/services/coach.ts:251-258` contains only `{ question, system, history, model, maxTokens }` — no `tools`, no `tool_choice`, no schemas. There is no tool-result handling in the response parse at `src/services/coach.ts:261-265`.

The nearest thing to a "tool" is the trek retrieval, and it is **not** a tool call: `trekContextBlock(...)` is string-concatenated onto the system prompt *before* the request, conditionally on a regex (`src/services/coach.ts:229-231`). The retrieval itself is a synchronous array filter over the bundled `TREKS` constant (`src/coach/trekSuggestions.ts:66-75`).

---

### 3.6 SAFETY

#### 3.6.1 Disclaimer constants, verbatim, and where each is rendered

**`COACH_DISCLAIMER`** — `src/coach/types.ts:133-134`:

> "The coach works from the sessions you record and from what you report. It is a planning aid, not a measurement of your body: it cannot tell you whether you are recovered, whether you are injured, or how you will respond to altitude. If something hurts, have it assessed by a doctor or a physiotherapist. For anything glaciated or technical, take instruction from an IFMGA-certified guide."

Rendered at **17 sites across 8 files** (re-greped in the verification pass; an earlier draft said "10 coach screens"): `src/screens/coach/CoachHub.tsx:598`, `src/screens/coach/Today.tsx:334`, `src/screens/coach/CheckIn.tsx:302`, `src/screens/coach/CoachPlan.tsx:346` and `:397`, `src/screens/coach/CoachProgress.tsx:504` and `:720`, `src/screens/coach/ReadinessScreen.tsx:414`, `:512`, `:697`, `src/screens/coach/RecoveryScreen.tsx:303`, `:377`, `:458`, `:574`, `src/screens/coach/SessionDetail.tsx:431`.

⚠ It is **not** rendered on `/coach/chat` nor on `/coach/fuel`. Verified against the import list: `src/screens/CoachChat.tsx:1-19` imports `Disclaimer` (the component) but never `COACH_DISCLAIMER` (the constant), and `src/screens/coach/Fuel.tsx` does not appear in a repo-wide grep for `COACH_DISCLAIMER`. These are the two coach surfaces most likely to be read as advice, and they are the two without it.

**`NUTRITION_DISCLAIMER`** — `src/coach/nutrition.ts:49-50`:

> "General fuelling guidance for training and recovery. It is not a prescription and not clinical advice, and it takes no account of medical conditions, medication, allergies or pregnancy. For anything clinical — a diagnosed condition, a restrictive diet, or a difficult relationship with food or eating — speak to a registered dietitian or your doctor. ICEFALL sets no weight or body-composition targets and will never advise you to eat less in order to reach one."

Rendered at: `src/screens/Nutrition.tsx:1453` and `src/screens/coach/CoachPlan.tsx:644`. ⚠ **Not** rendered on `/coach/fuel` — that screen carries its own shorter line instead (`src/screens/coach/Fuel.tsx:552-555`): `"Targets are estimates and should be adjusted to your needs. ICEFALL does not provide medical nutrition therapy."`

**`IMAGE_ANALYSIS_NOTE`** — `src/coach/nutrition.ts:59-60`:

> "A photograph is stored with the entry as a record — it is not read. There is no image model running in the app, so a picture cannot produce macronutrients on its own; automatic analysis would need a model running on a server, and even then what came back would be an estimate from an image rather than a measurement of what you ate. Type what was on the plate and the entry is matched against the food reference instead."

Rendered at `src/screens/Nutrition.tsx:1340`.

**`OBJECTIVE_READINESS_DISCLAIMER`** — `src/coach/mountainReadiness.ts:112-113`:

> "This is a planning aid. It is not a determination that you are competent or safe to attempt this mountain, and it does not clear you to go. ICEFALL judges the class of objective from elevation and position, and it can only see the sessions you record and what you choose to tell it — not the route you intend, not the conditions on the day, not your technical competence, and not how your body will respond to altitude. Nothing here is medical advice. The assessment that counts is made in person by an IFMGA/UIAGM-certified guide, and by you on the day: turning back is always available and always cheap."

Rendered at exactly four sites, none of them under `/coach` (line numbers corrected in the verification pass): `src/screens/explore/People.tsx:715`, `src/screens/explore/GroupWorkspace.tsx:670`, `src/screens/growth/ShareReadiness.tsx:651`, `src/screens/mountain/CommandCentre.tsx:1405`. ⚠ It is carried on the returned object (`src/coach/mountainReadiness.ts:1254`) but `src/screens/coach/Progress.tsx` — the Coach screen that consumes `assessObjectiveReadiness` — **does not render it**. Confirmed against that file's full import block (`src/screens/coach/Progress.tsx:1-15`): it imports `assessObjectiveReadiness` and `DimensionResult` from the module and nothing else, and no `Disclaimer` appears in it.

**`LOAD_DISCLAIMER`** — `src/coach/load.ts:239-240`:

> "Training load is derived only from sessions recorded in ICEFALL. Sessions you did not record are not in it, and neither is work, travel, illness or sleep. It describes your training, not your body, and it is not a medical assessment."

Rendered at `src/screens/coach/CoachProgress.tsx:425`. (A second constant of the same name exists at `src/tracking/analysis.ts:455` — a possible source of drift.)

**`EXERCISE_LIBRARY_DISCLAIMER`** — `src/coach/exercises.ts:1472-1473`:

> "These are training movements, not treatment. Sets and repetitions are starting points to be adjusted to the individual, and technique is best checked by a qualified coach. Stop any movement that produces pain and seek professional assessment rather than working around it. Technical mountain skills — cramponing, ice-axe use, rope work and glacier travel — are learned in person from a certified guide or instructor, and no amount of physical preparation substitutes for that instruction."

⚠ **Not rendered anywhere.** `grep -rn "EXERCISE_LIBRARY_DISCLAIMER" src` returns only its definition. `SessionDetail.tsx:36` imports `exerciseById` from that module but not the disclaimer.

#### 3.6.2 Per-reply chat disclaimers

`src/services/coach.ts:59-62`:

```ts
const MEDICAL_DISCLAIMER =
  "ICEFALL Coach is not a medical service. Persistent fatigue, pain or breathlessness should be assessed by a doctor.";
const GUIDE_DISCLAIMER =
  "Route and conditions judgement on technical terrain belongs with a certified mountain guide who can see the mountain on the day.";
```

Attached to rules:
- `GUIDE_DISCLAIMER` → the readiness rule (`src/services/coach.ts:135`) and the weather/conditions rule (`:171`).
- `MEDICAL_DISCLAIMER` → the fatigue rule (`:148`).
- Nutrition rule (`:141-142`), inline: `"General guidance only. For individualised nutrition — particularly with any medical condition — consult a registered dietitian."`
- Altitude rule (`:159-160`), inline: `"Altitude illness can become life-threatening quickly. Discuss any altitude plan and any prophylactic medication with a doctor experienced in altitude medicine, and climb with a certified guide on high peaks."`

⚠ **Four of the nine rules carry no disclaimer at all** — trek (`:74-77`), train-today (`:78-101`), gear (`:150-154`), increase-volume (`:162-166`) — **and neither does `FALLBACK`** (`:175-180`), which is what an unmatched question gets. `scripted()` copies `rule?.disclaimer` (`src/services/coach.ts:187`), so those replies render with none. (Corrected in the verification pass: the first draft said "five of the eight", counting `FALLBACK` as a rule and omitting the weather rule.)

Rendering: `src/screens/CoachChat.tsx:384-386` —
```tsx
{message.disclaimer && (
  <Disclaimer className="mt-2.5 text-left">{message.disclaimer}</Disclaimer>
)}
```

#### 3.6.3 Symptom / medical escalation paths that exist in executable code

**Recovery professional-referral flag** — `src/coach/recovery.ts:328-348`. Three triggers, each with a verbatim `flagReason`:

1. `soreness >= SEVERE_SORENESS` (i.e. `5`, `src/coach/recovery.ts:117`):
   > "You have reported soreness at the top of the scale. If it lasts beyond a few days, is sharp, or sits in one joint or tendon rather than across a muscle, arrange an assessment with a physiotherapist or doctor. ICEFALL cannot evaluate it."
2. `energy <= SEVERE_ENERGY` (i.e. `1`, `:116`):
   > "You have reported very low energy. If that continues for more than a few days, or comes with anything beyond ordinary training fatigue, speak to a doctor. ICEFALL cannot evaluate it."
3. `energy <= 2 && soreness >= 4`:
   > "Low energy and high soreness reported together. If both persist through a week of easy training, have it assessed by a doctor or physiotherapist."

Consequences that are actually implemented:
- Status is capped at `moderate` when flagged — `src/coach/recovery.ts:362`: `if (flagForProfessional && status === "good") status = "moderate";`
- A referral recommendation is appended — `src/coach/recovery.ts:522-526`: `"Have this looked at by a physiotherapist or doctor rather than training through it. ICEFALL is not a medical service."`
- Readiness guidance short-circuits before any score arithmetic — `src/coach/readiness.ts:556-562`, ending with `"ICEFALL cannot judge symptoms — a doctor or a physiotherapist can. Until then, keep any movement easy and stop at the first sign it makes things worse."`
- The Check-in screen renders the flag panel **above** the recommendations — `src/screens/coach/CheckIn.tsx:218-232`, under the heading `"Have this assessed"`.
- The Recovery screen documents rendering it first (`src/screens/coach/RecoveryScreen.tsx:33-37`).

**Altitude.** Two altitude-specific safety lines exist in the fuelling engine: `src/coach/nutrition.ts:253-255` — `"Feeling unwell at altitude is a medical matter, not a fuelling problem. Descend and get proper help rather than trying to eat through it."` — and the altitude chat rule's disclaimer (3.6.2). `limitationsBlock` escalates a reported history of altitude illness into a prompt constraint (`src/coach/context.ts:401-405`) — but that constraint only reaches a model, and no model runs. In the scripted path, `ctx.athlete.altitudeIllness` is **never read**: `grep -rn "altitudeIllness" src/services/coach.ts` returns nothing. So an athlete who reported serious altitude illness gets the same fixed altitude paragraph as everyone else.

**Limitations.** Same shape: `ctx.athlete.limitations` / `limitationsNote` are read only by `limitationsBlock` (`src/coach/context.ts:393-398`) and therefore have **no effect on any reply produced today**. They do reach `buildSession` via the discomfort modification path (`src/coach/sessions.ts:86-90`, `:1698`) — that is a separate, working route.

**No symptom classifier exists.** There is no keyword list for AMS/HACE/HAPE, chest pain, or any other symptom anywhere in `src/coach/` or `src/services/coach.ts`.

Worked through all nine regexes in the verification pass, the message *"I have a headache and I'm vomiting at 4200 m"* matches **none of them** — rule 7 needs one of `altitude|acclimat|oxygen|thin air|hypox` and the sentence has none; rule 4's `\beat(ing)?\b` does not fire inside "headache" because of the word boundary. It therefore falls to `FALLBACK` (`src/services/coach.ts:175-180`), which is a menu of topics and carries **no disclaimer at all**. The athlete's own `altitudeIllness` answer is not read on this path either: `grep -n "altitudeIllness" src/services/coach.ts` returns nothing. *(An earlier draft of this paragraph contained a self-contradictory parenthesis — "matches rule 7 … in fact it matches no rule". The conclusion was right; the sentence is rewritten above.)*

---

### 3.7 METERING

There are **two independent limits**, with different periods and different behaviour. `src/screens/coach/CoachHub.tsx:371-388` documents the distinction and the code matches it.

#### Limit A — free-tier monthly conversations (a hard block)

- Constant: `FREE_COACH_INTERACTIONS_PER_MONTH = 3` — `src/growth/tiers.ts:47`.
- Feature gate: `{ id: "coach.unlimited", label: "Coach — unlimited", group: "Coach", tiers: ["pro"] }` — `src/growth/tiers.ts:198`. Tiers are `"free" | "pro"` only (`src/growth/tiers.ts:28`).
- Enforced in `AppState`:
  - `coachInteractionsLeft` — `src/state/AppState.tsx:1321-1324`. Returns `null` on an unlimited tier; otherwise `Math.max(0, FREE_COACH_INTERACTIONS_PER_MONTH - coachUsage.count)`.
  - `recordCoachInteraction` — `src/state/AppState.tsx:1326-1336`. No-ops for unlimited tiers (so a trial does not burn the free allowance — comment at `:1327-1329`).
  - Month rollover is read, not written — `src/state/AppState.tsx:1315-1319`.
  - A trial counts as `pro` — `src/state/AppState.tsx:1303-1306`.
- Enforced in the UI:
  - `src/screens/CoachChat.tsx:35` — `const atLimit = coachInteractionsLeft !== null && coachInteractionsLeft <= 0;`
  - `src/screens/CoachChat.tsx:128` — `if (!q || thinking || atLimit) return;` (the actual block)
  - `src/screens/CoachChat.tsx:132` — `recordCoachInteraction()` runs **before** the answer, so the last allowed question still gets answered.
  - `src/screens/coach/CoachHub.tsx:437` — the hub's ask bar refuses to navigate.

**What the athlete sees at Limit A.** On `/coach/chat` the suggestion chips are hidden (`src/screens/CoachChat.tsx:285`, `{!atLimit && (`) and the composer is *replaced* by the upgrade block (`:305-317`, `featureId="coach.unlimited"` at `:313`) — no modal, no dismissible banner. The copy is from `useUpgradeCopy("coach")` (`src/growth/upgradeCopy.ts:41-47`), verbatim:

- title: `"That's your free Coach conversations for this month."`
- body (with an objective still ahead): `` `Unlimited Coach with ICEFALL Pro — every day of preparation, right up to ${ahead.mountain}, ${ahead.when}.` ``
- body (otherwise): `"Unlimited Coach with ICEFALL Pro — ask as often as you train."`

`UpgradePrompt` (`src/components/growth/UpgradePrompt.tsx:102-139`) renders those two lines, a link to `/pricing` labelled `"Unlock my plan"` (`CTA_LABEL`, `:42`), and beneath it `BILLING_LINE` (`:51`): `"Billing is not connected yet — nothing is charged."` It renders **nothing** when the tier already has the feature (`:109`).

On `/coach` the hub replaces its ask bar with a card headed `"Ask your coach"` reading `"You have used this month's free coach conversations."` plus the same `UpgradePrompt` (`src/screens/coach/CoachHub.tsx:463-477`).

While below the limit, both screens print the same counter line (`src/screens/CoachChat.tsx:327-331`, `src/screens/coach/CoachHub.tsx:532-536`):
```
{coachInteractionsLeft} free {coachInteractionsLeft === 1 ? "conversation" : "conversations"} left this month
```

#### Limit B — daily credits and a monthly money backstop (NOT a block)

Constants in `src/coach/budget.ts`:
- `DAILY_CREDITS = 8` (`:68`) — one credit per model-answered reply, resetting on the athlete's **local** day (`currentDay`, `:142-144`).
- `HARD_CAP_MICROS = 1_000_000` (`:84`) — $1.00, **monthly** (`currentPeriod`, `:131-133`), never shown to anyone.
- `MAX_REPLY_TOKENS = 700` (`:93`).
- `HISTORY_TURNS = 6` (`:96`).
- `MODEL_RATES` (`:38-45`) in micro-dollars per MTok: haiku-4-5 `1_000_000 / 5_000_000` (cached input `100_000`), sonnet-5 `3_000_000 / 15_000_000` (`300_000`), opus-5 `5_000_000 / 25_000_000` (`500_000`).
- `isExhausted(s)` (`:177`) — `creditsLeft(s) <= 0 || remainingMicros(s) <= 0`.

Enforcement: **client-side only, and pre-flight**. `src/services/coach.ts:232-242` estimates the exchange with `estimateExchangeMicros` (pessimistic: full reply, no cache hit — `src/coach/budget.ts:184-196`) and, if over budget, waits 320 ms and returns the scripted reply with `scripted: true`. Spend is banked from the proxy-reported `usage` at `src/services/coach.ts:269` and `src/screens/CoachChat.tsx:144` (`if (spentMicros > 0) recordCoachSpend(spentMicros);`); one credit is consumed per banked reply regardless of cost (`src/state/AppState.tsx:1382`).

⚠ `src/coach/budget.ts:8-20` states plainly that this is a browser-side courtesy stop and that "The real cap MUST live in the server-side proxy that holds the API key". **No such proxy exists in this repository** (see 3.1). Also note that in the compiled bundle the `budgetMicros` parameter is accepted and never read — the whole estimate/limit branch was eliminated with the model branch.

**What the athlete sees at Limit B.** Nothing is blocked. Both screens swap the credit counter for one line (`src/screens/CoachChat.tsx:339-346`, `src/screens/coach/CoachHub.tsx:540-547`):
```
Saved guidance · more tomorrow
```
Otherwise:
```
{creditsLeft(coachBudget)} coach {creditsLeft(coachBudget) === 1 ? "credit" : "credits"} today
```

Because `askCoach` never spends anything in this build (`spentMicros: 0` unconditionally), `recordCoachSpend` is never called from the chat, `creditsUsed` stays at 0, and the counter permanently reads **"8 coach credits today"**. Verified: the only call site is `src/screens/CoachChat.tsx:144`, guarded by `if (spentMicros > 0)`.

---

### 3.8 Things a redesigner will otherwise trip over

1. **The 5–9 second artificial "Thinking…" delay.** `src/screens/CoachChat.tsx:180-184`:
   ```ts
   const MIN_VISIBLE_MS = 5_000 + Math.floor(Math.random() * 4_000);
   const shownFor = Date.now() - askedAt;
   if (shownFor < MIN_VISIBLE_MS) {
     await new Promise((r) => setTimeout(r, MIN_VISIBLE_MS - shownFor));
   }
   ```
   This is on top of the 620 ms inside `askCoach` (`src/services/coach.ts:278`), so a scripted reply takes 5.0–9.0 s to appear. The comment block at `src/screens/CoachChat.tsx:170-179` records this as the owner's explicit, twice-taken decision — measured in the running app, and deliberately ending at 9 s rather than 10 s to offset ~600 ms of render latency and ~300 ms of exit fade — and asks that it not be "fixed" back. It is a deliberate delay, not a measurement of anything.

2. **The Coach never reads any wearable data, despite the plumbing existing.** `src/coach/hooks.ts:69-78` passes `restingHeartRateBpm: undefined` (`:74`) and `sleepMinutes: undefined` (`:75`) — hard-coded. Re-verified 2026-09-11 after that file was edited. `src/tracking/sources/vitals.ts:400-409` exports `coachVitalInputs(vitals)`, which produces exactly the shape `assessRecovery` wants and correctly distinguishes `undefined` / `null` / number (`:353-373`). **`coachVitalInputs` has no callers** — `grep -rn "coachVitalInputs" src` returns only its definition. Meanwhile a full Oura schema exists in Supabase (`icefall-supabase/migrations/20260903060000_oura_health.sql`, including `public.oura_daily_readiness` at `:583`) and a Strava migration exists (`20260907140000_strava_connection.sql`). So the comment in `src/coach/hooks.ts:52-55` ("No browser exposes them") describes a state that the rest of the codebase has since moved past.

3. **`bodyMassKg` has a real defaulting trap, already fixed once.** `src/coach/context.ts:161-171` explains that a previous version read the defaulted value (72 kg) and reported it to the model as a fact. The fix reads `bodyMassKgSet` (the raw stored value, null until answered). Anything new that reads body mass must use `bodyMassKgSet`, not `bodyMassKg`.

4. **Two "Plan" and two "Progress" screens.** `Plan.tsx` / `CoachPlan.tsx` and `Progress.tsx` / `CoachProgress.tsx` are both live at different routes (see 3.0). `src/screens/coach/details.tsx:5-19` explains the arrangement.

5. **The tab strip inside `CoachHead` was removed** (`src/screens/coach/shell.tsx:20-28`); `COACH_TABS`, `CoachTab`, `activeCoachTab` and the five-tab swipe in `CoachLayout` went with it. `noUnusedLocals` is false in this project, so unused coach exports are not reported — `openingMessage` and `EXERCISE_LIBRARY_DISCLAIMER` are both live examples of that.

6. **Most of the rule regexes have no word boundaries**, so they match inside other words. `/gear|equipment|kit|wear|jacket|boots|layer/i` (`src/services/coach.ts:151`) matches "kitchen", "swear", "player"; `/increase|more volume|harder|\bpush\b|add training|\bramp(ing|s)?\b/i` (`:163`) matches "harder" inside a sentence about anything. Only `\bpush\b` and `\bramp\b` in rule 8 and the `\b`-anchored alternatives in rule 4 are bounded. Since `RULES.find` returns the first match (`src/services/coach.ts:183`), an accidental hit routes the whole answer.

7. **Chat is not reachable from anywhere except the hub card, the hub ask bar and Today's "Ask Coach" button** — `src/screens/coach/CoachHub.tsx:268` (card), `:438` (`navigate("/coach/chat", { state: { ask: q } })`), `src/screens/coach/Today.tsx:313-319`. The inbound question travels as router state, not a query param (`src/screens/CoachChat.tsx:102-124`), so it does not survive a reload. *(CoachHub and Today were edited during this audit — re-check these three numbers.)*

---

### Verification pass — 2026-09-11

Independently re-checked. Corrections marked inline. Summary:

- **RE-CONFIRMED, exactly:** the headline. `src/coach/hooks.ts:74-75` still reads
  `restingHeartRateBpm: undefined,` / `sleepMinutes: undefined,` — re-read after that file was
  edited mid-audit. `coachVitalInputs` (`vitals.ts:400`) and `useVitals` (`useOura.ts:57`) have
  **zero call sites** each; a repo-wide grep for both names returns five lines in two files, all of
  them definitions or the one internal call.
- **RE-CONFIRMED, exactly:** `ReadinessScreen.tsx:214-225` hard-codes HRV and Sleep as
  `unavailable("not-connected")` with the two notes quoted below, both character-accurate; the six
  rendered rows are not the four scoring components; `goal-alignment` (weight 0.20) is not among
  them.
- **RE-CONFIRMED, exactly:** `WEIGHTS` (`readiness.ts:87-92`), `MIN_COMPONENTS = 3` (`:95`) sitting
  directly under a comment that says "Fewer than two", and the renormalising aggregation
  (`:662-683`).
- **RE-CONFIRMED, exactly:** COROS `listActivities` is `return Promise.resolve([]);`
  (`watch/coros.ts:226`); Garmin's eight methods all `throw new Error("garmin adapter not built")`
  (`watch/registry.ts:101-135`, `gate: "not-built"` at `:103`); `SPORT_TO_TYPE` is
  `{ coros: {}, polar: {}, suunto: {}, garmin: {} }` (`watch/map.ts:36-41`) with `?? "other"` at
  `:47`.
- **RE-CONFIRMED, exactly:** `sendEnquiry` sends four arguments (`enquiries/send.ts:121-126`);
  `draftEnquiry` declares `preparation?: number` (`services/operators.ts:881`) and never uses it —
  it is the only occurrence of that identifier in the file; `operator_enquiries` exposes thirteen
  columns and no health, fitness or readiness field; the operator portal reads none of it (the only
  hit anywhere in `icefall-operator` is `tests/live-rls.probe.ts:146`).
- **RE-CONFIRMED:** no model is called. `VITE_COACH_ENDPOINT` is absent from `icefall-app/.env.local`
  (which declares exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — values
  [secret — not reproduced]) and from `vercel.json`; the compiled `askCoach` in both
  `dist/assets/coach-8k75RJyC.js` and `dist-verify/assets/coach-CClCJY3H.js` contains no `fetch(`.
  So the system prompt described in §4.8 is built and never sent.
- **CORRECTED:** `icefall-web/api/_oura.mjs` metric payload is at `:934-961`, not `:880-906`; the
  `context` block at `:967-971`, not `:913-917`.
- **CORRECTED:** `public.operator_enquiries` is defined at
  `20260831150000_enquiry_delivery.sql:133-154`, not `:55-75` (that range is the
  `enquiries_guard()` trigger).
- **CORRECTED:** `resolveVitals` is not mentioned at `screens/Health.tsx:219`; the comment there
  (`:218`) names the module path.
- **NEW — §4.6b.** Another session created `icefall-supabase/supabase/functions/health/` **during
  this audit** (Polar / WHOOP / Withings / Oura adapters). There are now three edge functions, not
  two. It cannot run — none of the four tables it queries exists in any migration — and no client
  references it. One clause in it is directly relevant to a coaching redesign and is quoted in full.
- **Migration count:** 69 `.sql` files. **Whether any migration named here has been applied to the
  live Supabase project cannot be determined from the repository.** Every DB statement in this
  section describes a migration file.
- **Uncertainties unchanged:** whether Oura/watch credentials are set in the deployed environments,
  whether an Oura webhook subscription exists at Oura's end, whether any enquiry has been handed
  off, and whether Polar's and Suunto's response envelopes are right. None is answerable from the
  repository.

---

### 4. Wearable & health data

All paths below are absolute-relative to
`/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/`. Line numbers are from the
files as they stand on branch `claude/laughing-agnesi-a2f87e`.

⚠️ **Several coach files were being edited by another session while this audit was being written,
and still were during the verification pass.** Modification times at 00:52 on 2026-09-11:
`src/coach/hooks.ts` 00:29, `src/coach/context.ts` 00:30, `src/screens/coach/Today.tsx` 00:33,
`src/screens/coach/CoachHub.tsx` 00:38, `src/screens/CoachChat.tsx` 00:46 (it grew from 415 to 444
lines during the pass itself), `src/screens/coach/Plan.tsx` 00:47. `icefall-supabase/supabase/
functions/health/` was created wholesale between 00:32 and 00:39 (see §4.9 below).

Citations here are against the files as they stood at 00:52. **Re-verified after those edits:**
`src/coach/hooks.ts` is now 145 lines and the two hard-coded health fields are still at
`hooks.ts:74-75`, unchanged, inside the `assessRecovery` call at `:69-78`. None of the observed
edits wires a wearable to anything.

#### 4.0 The one-line answer

**The coach uses exactly ONE piece of device-derived data: `avgHeartRateBpm` on a *recorded
activity*, used to scale training-load intensity (`icefall-app/src/coach/load.ts:158-187`).**
Nothing else — no HRV, no sleep, no resting heart rate, no SpO2, no Oura reading, no watch
metric — reaches the coach, the readiness score, the recovery score or the AI prompt. The two
health fields `assessRecovery` accepts are **hard-coded to `undefined` at the only call site**
(`icefall-app/src/coach/hooks.ts:74-75`), and the resolver written to feed them
(`coachVitalInputs`) **is never called from anywhere**.

---

#### 4.1 Source inventory — what exists, and what state it is in

| Source | File | What it is, in executable terms |
|---|---|---|
| Device GPS | `icefall-app/src/tracking/sources/geolocation.ts` | **Working.** `navigator.geolocation.watchPosition` with `enableHighAccuracy` (line 78). Real. |
| Bluetooth HR strap | `icefall-app/src/tracking/sources/heartRate.ts` | **Working**, where Web Bluetooth exists. Real GATT `heart_rate` subscription (lines 88-108). |
| Apple Health / Health Connect | `icefall-app/src/tracking/sources/health.ts` | **Contract only — no bridge ships.** See 4.2. |
| Oura Ring | `icefall-app/src/tracking/sources/oura.ts` + `icefall-web/api/_oura.mjs` | **Fully implemented end-to-end**, but reaches exactly one screen. See 4.3. |
| Vitals resolver | `icefall-app/src/tracking/sources/vitals.ts` | **Written, exported, and effectively dead.** See 4.4. |
| Watch accounts (COROS/Polar/Suunto/Garmin) | `icefall-app/src/watch/` + `icefall-supabase/supabase/functions/watch/` | **Two of four can return data; the sport-type mapping table is empty for all four.** See 4.5. |
| Strava | `icefall-app/src/strava/` | **Export only. ICEFALL never reads Strava data.** See 4.6. |
| GPS simulator | `icefall-app/src/tracking/sources/simulator.ts` | Labelled fake track; filtered out of every coach calculation. |

---

#### 4.2 Apple Health / Health Connect — a contract with no implementation

`icefall-app/src/tracking/sources/health.ts` declares seven metrics
(`HealthMetricId`, lines 18-25): `steps`, `distance`, `floors`, `activeEnergy`,
`exerciseMinutes`, `restingHeartRate`, `sleep`.

The bridge is **detected, never provided**. `detectBridge()` (lines 99-130) looks for
`window.IcefallHealth`, or `window.Capacitor.Plugins.Health` / `.CapacitorHealthkit` /
`.HealthConnect`. Nothing in this repository injects any of those:

- No Capacitor config, no `@perfood/capacitor-healthkit`, no `capacitor-health-connect` — the
  plugin names appear only inside the file's own header comment (lines 10-15) as instructions for
  a future wiring job. **Not implemented.**
- Therefore in every build that exists today the constructor takes the `unsupported` branch
  (`health.ts:162-166`) and every metric resolves to
  `{ value: null, reason: "unsupported" }` via `daySummary()`'s early return (lines 243-255).

The `unsupported` sentence shown to the user, verbatim (`health.ts:165`):

> "Apple Health and Health Connect are only reachable from the ICEFALL mobile app. On the web there is no API that can read your step count."

There is a **labelled sample dataset** (`health.ts:315-328`) — steps 12,305, distance 9,140 m,
floors 34, active energy 742 kcal, exercise 96 min, resting HR 48 bpm, sleep 437 min — switched on
by `useSampleData(true)`, reachable from a button on `icefall-app/src/screens/Health.tsx:96`. It is
gated behind `state.sample` and never feeds the coach.

**Sync cadence:** none. `daySummary()` and `stepSeries()` are pull-on-demand, called from
`Health.tsx:45-46` on mount and from `useVitals` (`useOura.ts:76`). No timer, no background sync.

---

#### 4.3 Oura — the only fully-built wearable integration

##### What is actually pulled and stored

The server (`icefall-web/api/_oura.mjs`) writes into six tables created by
`icefall-supabase/migrations/20260903060000_oura_health.sql`:

- `oura_sleep_periods` (line 511) — `average_hrv_ms`, `average_heart_rate_bpm`,
  `lowest_heart_rate_bpm`, `average_breath_per_min`, `total_sleep_min`, `deep_sleep_min`,
  `rem_sleep_min`, `light_sleep_min`, `awake_min`, `time_in_bed_min`, `latency_min`,
  `efficiency_pct`, `restless_periods`, `low_battery_alert`, `period_type`.
- `oura_daily_sleep` (line 560) — eight 0-100 scores only.
- `oura_daily_readiness` (line 583) — `readiness_score`, `temperature_deviation_c`,
  `temperature_trend_deviation_c`, plus nine contributor scores including
  `resting_heart_rate_score` (commented at line 604: "SCORE, NOT BPM").
- `oura_daily_activity` (line 617) — `steps`, `active_calories_kcal`, `total_calories_kcal`,
  `equivalent_walking_distance_m`, activity-minute buckets, `non_wear_min`, `average_met_minutes`.
- `oura_daily_spo2` (line 659) — `spo2_average_pct`, `breathing_disturbance_index`.
- `oura_daily_stress` (line 674) — `stress_high_min`, `recovery_high_min`, `day_summary`.

The summary endpoint returns 19 metrics (`icefall-web/api/_oura.mjs:934-961` — line numbers corrected in the verification pass; the first draft said `:880-906`): 14 measurements
(`hrv`, `restingHeartRate`, `averageHeartRate`, `respiratoryRate`, `sleepMinutes`,
`deepSleepMinutes`, `remSleepMinutes`, `sleepEfficiency`, `spo2`, `temperatureDeviation`, `steps`,
`activeCalories`, `stressHighMinutes`, `recoveryHighMinutes`) and 5 scores (`readinessScore`,
`sleepScore`, `activityScore`, `hrvBalanceScore`, `restingHeartRateScore`). The client mirrors
these as `OuraMetricId` (`icefall-app/src/tracking/sources/oura.ts:164-185`), with `kind:
"measurement" | "score"` on every one so a contributor score cannot render as bpm.

**Declared but never populated:** `breathing_disturbance_index`, `light_sleep_min`, `awake_min`,
`time_in_bed_min`, `latency_min`, `restless_periods`, `total_calories_kcal`,
`equivalent_walking_distance_m`, the activity-minute buckets, `average_met_minutes`,
`inactivity_alerts` and every `oura_daily_sleep` sub-score are stored in the database but are
**not in the `/summary` payload** (`_oura.mjs:934-961`), so no client code can read them.
`non_wear_min` is stored and reaches the client only as `context.nonWearMinutes`
(`_oura.mjs:967-971`); the migration says so itself at line 636 ("Stored although nothing renders
it yet").

##### Where an Oura reading actually appears on screen

**Exactly one screen:** `icefall-app/src/screens/settings/HealthSources.tsx`, routed at
`icefall-app/src/App.tsx:567` (`/settings/health-sources`). It renders
`OURA_MEASUREMENTS.map(…)` at lines 283-286 and `OURA_SCORES.map(…)` at lines 299-301, gated on
`state.status === "connected"` (line 264).

⚠️ **Stale comment warning.** `icefall-web/api/_oura.mjs:29-38` states: *"WHAT REACHES A SCREEN
TODAY … Nothing."* That is **false as of the current tree** — `HealthSources.tsx` renders the
values. The comment is correct about the *coach* surfaces (`SensorGap`,
`unavailable("not-connected")`, `restingHeartRateBpm: undefined`), which are indeed untouched.

##### Sync cadence and triggers

- **On mount / on demand only.** `useOura` calls `ouraService.refresh()` in a `useEffect` with
  `[]` deps (`useOura.ts:41-43`). `HealthSources.tsx` calls it at lines 114, 143, 158.
  `Connect.tsx:944` calls it during sign-up.
- **No polling, deliberately** — `useOura.ts:15-19`: "Nothing here polls."
- **Backfill** is a bounded 40-page loop over `POST /api/oura/backfill`, user-initiated
  (`oura.ts:1028-1065`).
- **Server-side webhook** exists: `icefall-web/api/oura/webhook.js` (HMAC-verified, raw-body,
  `config.api.bodyParser = false`). This is what keeps the database fresh; the app never learns
  about a webhook and only re-reads when told to.
- **Two freshness windows.** Server-side `OURA_FRESHNESS_DAYS`, default 2
  (`_oura.mjs:93, 841-845`) — anything older comes back as `no-recent-data`. Client-side
  `SUMMARY_MAX_AGE_MS = 6h` (`oura.ts:142`); past that, `summary()` replaces every metric with
  `allAbsent("unreachable")` (`oura.ts:748-750`).

##### Configuration state in this working copy

`API_BASE` comes from `VITE_ICEFALL_API_BASE` (`oura.ts:92`) and `RETURN_URL` from
`VITE_ICEFALL_OURA_RETURN_URL` (`oura.ts:106`). **Neither is present in
`icefall-app/.env.local`**, which contains only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (values `[secret — not reproduced]`). With `API_BASE` empty the
service initialises to `status: "not-configured"` (`oura.ts:690`) and `refresh()` returns
immediately (`oura.ts:786-789`). In a local run, **the Oura integration is off**. Deployed Vercel
env may differ — see Uncertain.

##### Consent gating

`refresh()` reads `readHealthConsent()` **before any fetch** (`oura.ts:793`) and returns early on
anything other than `granted` (`oura.ts:819-834`). Consent wording is read from the database
(`health_consent_wording_in_force`) and rendered verbatim, never hard-coded
(`icefall-app/src/health/consent.ts:18-31`). Withdrawal triggers `oura_delete_all` inside the same
transaction, server-side (`consent.ts:46-53`).

##### The twelve absence reasons, verbatim

`icefall-app/src/tracking/sources/oura.ts:418-436`:

```
  "not-configured": "This build is not set up to connect a ring.",
  "signed-out": "Sign in to see your ring measurements.",
  "consent-not-given": "Storing health measurements needs your permission first.",
  "not-connected": "No Oura ring is connected.",
  reauthorise:
    "ICEFALL's access to your Oura account has ended. Connect again to start reading it.",
  "membership-lapsed":
    "Oura has stopped sharing your data, which usually means the Oura membership has lapsed.",
  "rotation-lost":
    "ICEFALL lost the link to your ring and needs you to connect again. That was our end, not yours.",
  "token-unreadable":
    "ICEFALL can no longer read its own record of the connection. Connect again to replace it.",
  "consent-withdrawn": "You withdrew permission for health measurements, and they were deleted.",
  "no-data": "Your ring did not record this.",
  "no-recent-data":
    "Nothing recent enough to show. The most recent reading is too old to be today's.",
  unreachable: "ICEFALL could not reach the server, so there is nothing to show.",
```

---

#### 4.4 The vitals resolver — written, correct, and dead

`icefall-app/src/tracking/sources/vitals.ts` defines `resolveVitals()` (line 263) with a fixed
per-metric source order (`SOURCE_ORDER`, lines 153-171): Oura first for overnight physiology, the
phone store first for daytime movement. It also defines `coachVitalInputs()` (line 400), which
produces exactly the `{ restingHeartRateBpm, sleepMinutes, sources }` shape `assessRecovery` wants,
with the `undefined` (no source) vs `null` (source asked, empty) distinction preserved
(`coachField`, lines 395-398).

**Neither is wired to the coach.** A repository-wide grep for `resolveVitals|coachVitalInputs`
(re-run in the verification pass) returns **five lines in two files, and nothing else**:

- `src/tracking/sources/vitals.ts:263` (`resolveVitals`), `:374` (`interface CoachVitalInputs`), `:400` (`coachVitalInputs`) — the definitions;
- `src/tracking/sources/useOura.ts:4, 91` — `useVitals()` calls `resolveVitals`;

*(The first draft also listed `src/screens/Health.tsx:219` as a comment mention. Corrected: that comment, at `Health.tsx:218`, names the module path `tracking/sources/vitals.ts`, not either function. It says the Health tiles "will not fill in once a ring is connected — they will not, until they are rewired to `tracking/sources/vitals.ts`", which is itself evidence for the finding.)*
`coachVitalInputs` has **zero call sites**. `useVitals` has **zero call sites** — a grep for
`useVitals` across `src/` returns only its own definition (`useOura.ts:57`) and its own doc comment
(`useOura.ts:11`). So the resolver runs nowhere in the shipped app.

The comment at `vitals.ts:359-372` describes `coach/hooks.ts` passing `undefined` and says the
distinction "is now load-bearing rather than decorative". It is not: nothing consumes it.

---

#### 4.5 Watch accounts (COROS / Polar / Suunto / Garmin)

##### Client half — built

`icefall-app/src/watch/connection.ts` implements `useWatchStatus()` (line 103),
`beginWatchConnect()` (230), `finalizeWatchConnect()` (287), `disconnectWatch()` (358) and
`importWatchActivities()` (422). Import is **manual only** — the two triggers are:

- `icefall-app/src/screens/settings/Connections.tsx:778` — a button per provider;
- `icefall-app/src/screens/settings/Connections.tsx:335` — one automatic `deep: true` COROS import
  fired once immediately after a successful finalize.

The import cursor is **per-device localStorage**, key `icefall.watch.import.v1`
(`icefall-app/src/watch/cursor.ts:18`); the server keeps no cursor.

##### Server half — per-provider reality

| Provider | `gate` | `listActivities` | Verdict |
|---|---|---|---|
| COROS | `"none"` (`coros.ts:136`) | `return Promise.resolve([]);` (`coros.ts:226`) | **Stubbed — returns `[]` at `icefall-supabase/supabase/functions/watch/coros.ts:226`.** OAuth is real; activity data is not. |
| Polar | `"none"` (`polar.ts:95`) | Real fetch of `/training-sessions/list` + `mapSession` (`polar.ts:164-199`) | Implemented, unverified envelope (comment at `polar.ts:184-186`). |
| Suunto | `"vendor-approval-required"` (`suunto.ts:134`) | Real fetch of `/v2/workouts`, filtered client-side because query-param names are undocumented (`suunto.ts:199-231`) | Implemented but gated off. |
| Garmin | `"not-built"` (`registry.ts:103`) | `throw new Error("garmin adapter not built")` (`registry.ts:126-128`) | **Not implemented.** |

The `WatchActivity` shape (`icefall-app/src/watch/types.ts:37-53`) carries `avgHeartRateBpm` and
`maxHeartRateBpm` — the only physiological fields — plus duration/distance/ascent/calories.

**Sport-type mapping is empty for all four providers.** `SPORT_TO_TYPE` in
`icefall-app/src/watch/map.ts:36-41` is literally `{ coros: {}, polar: {}, suunto: {}, garmin: {} }`,
so every imported activity lands on `"other"` via the `?? "other"` fallback at `map.ts:47`.

**v1 imports no track.** `watchActivityToRecorded` sets `points: []`, `splits: []`, and every
capability flag `false` (`map.ts:102-112`), and nulls `maxAltitudeM`, `minAltitudeM`,
`avgSpeedMps`, `avgPaceSecPerKm`, `avgCadenceSpm`, `verticalRateMPerH`, `temperatureC`
(`map.ts:89-100`).

##### Does a watch import reach the coach?

**Yes, indirectly and only via heart rate.** `importWatchActivity`
(`icefall-app/src/tracking/import.ts:17-31`) routes through `finalizeActivity`, which writes a
normal `RecordedActivity` into the feed. `useCoachIntel` reads that feed
(`icefall-app/src/coach/hooks.ts:54, 63`), and `sessionLoadDetail` reads
`a.avgHeartRateBpm`. So a Polar-imported average heart rate can move the training-load component.
Nothing else on a watch activity is treated as physiology.

---

#### 4.6 Strava — outbound only

`icefall-app/src/strava/connection.ts` exposes `uploadToStrava()` (line 350) and nothing that
reads. The edge function has four routes — `begin`, `callback`, `finalize`, `upload`, `disconnect`
(`icefall-supabase/supabase/functions/strava/index.ts:622-626`) — and **no import route**. The
requested scope is `"activity:write,read"` (`index.ts:74`), with an explicit comment (lines 70-73)
that `activity:read_all` is deliberately not requested.

Upload sends only track + title: "ONLY THE TRACK AND THE TITLE ARE SENT — not the calorie estimate,
not the readiness score" (`icefall-app/src/strava/connection.ts:337-341`), and the request body is
`{ name, activityTypeId, points }` (lines 377-381).

**Conclusion: Strava contributes zero data to the coach.**

---

#### 4.6b The `health` edge function — created during this audit, and unable to run

**This did not exist when §4.1's inventory was written.** Between 00:32 and 00:39 on 2026-09-11
another session created `icefall-supabase/supabase/functions/health/`, so there are now **three**
edge-function directories (`strava`, `watch`, `health`), not two. It was still being written during
the verification pass — `index.ts` appeared between two consecutive directory listings — so every
line number below is provisional.

What is in it, as of 00:52:

| File | What it is |
|---|---|
| `types.ts` | `HealthProvider = "polar" \| "whoop" \| "oura" \| "withings"`; `HEALTH_PROVIDERS` in display order polar, whoop, withings, oura (`types.ts:32-37`) |
| `registry.ts` | The adapter interface, `HealthGate = "none" \| "legal-hold"` (`:44`), `ADAPTERS` (`:104-109`) |
| `crypto.ts` | AES-256-GCM token sealing, key from `HEALTH_TOKEN_KEY` (`crypto.ts:44`) — key **name** only; no value read |
| `polar.ts` | Real OAuth against `auth.polar.com` / `polaraccesslink.com` for daily physiology |
| `whoop.ts` | Real OAuth against `api.prod.whoop.com`; scopes `read:recovery, read:sleep, read:cycles, read:workout, read:profile, offline` (`whoop.ts:58-65`) |
| `withings.ts` | Real OAuth + webhook subscription at connect time; scopes `user.info, user.metrics, user.activity, user.sleepevents` (`withings.ts:81`); ECG deliberately not requested |
| `oura.ts` | **A descriptor, not an implementation. Every method throws.** `gate: OURA_LEGAL_HOLD_CLEARED ? "none" : "legal-hold"` (`oura.ts:90`) |
| `index.ts` | `Deno.serve` at `:687`; routes `GET providers`, and per-provider `POST begin` / `GET callback` / `POST finalize` / `POST disconnect`, plus `POST\|HEAD withings/webhook`. Everything else 404s (`:687-717`) |

**It cannot run, and it reaches nothing.** Three independent facts:

1. **No schema.** `index.ts` queries `health_connections`, `health_oauth_states`,
   `health_pending_links` and `health_webhook_events`, and calls `rpc("health_sweep_states")`.
   A grep of all **69** files in `icefall-supabase/migrations/` finds **none of those four tables
   and none of that function**. There is no migration for this feature.
2. **No client.** A grep of `icefall-app/src` for `HEALTH_PROVIDERS`, `health/providers` and
   `healthProvider` returns nothing. `icefall-app/src/health/` contains one file, `consent.ts`.
3. **The files its own comments point at do not exist.** `health/types.ts:5` says the other copy of
   the vocabulary is `icefall-app/src/health/types.ts`; `health/polar.ts:9` says the Polar text
   credit is "MET IN THE APP" at `icefall-app/src/health/PolarCredit.tsx`. **Neither file is in the
   repository.** This is exactly the comment-versus-code trap this audit was asked to watch for: the
   comments describe a two-sided integration of which only one side exists.

**One clause in it bears directly on a coaching redesign**, and it is quoted verbatim from
`icefall-supabase/supabase/functions/health/oura.ts:44-49`:

> "CLAUSE 2 — AI TRAINING. Oura data may NEVER be used to train or improve any AI model. ICEFALL has a Coach. Today the Coach is scripted, and `VITE_COACH_ENDPOINT` is unset — but the moment a model is put behind it, passing an Oura-sourced HRV into a prompt is arguably "ingestion into a context window", which is the reading Strava published for its own equivalent clause. Nothing in the code stops that today except the Coach having no model, which is not a control."

That is the codebase's own statement that **the only thing currently preventing an Oura-to-LLM data
path is the absence of the model**, which is the single change a coaching redesign is most likely to
make.

---

#### 4.7 Live-recording sensors

- **Heart rate.** `BluetoothHeartRateSource` is instantiated in
  `icefall-app/src/tracking/useRecorder.ts:224`, samples pushed to
  `recorder.pushHeartRate` (`useRecorder.ts:226`). The recorder accumulates `hrSamples`
  (`recorder.ts:428-436`) and writes `avgHeartRateBpm` (`recorder.ts:767-769`) and
  `maxHeartRateBpm` (`recorder.ts:855`) onto the finished activity. **This is the one wearable
  signal the coach consumes.**
- **Cadence, power, temperature.** `pushCadence` (`recorder.ts:439`), `pushPower`
  (`recorder.ts:445`) and `pushTemperature` (`recorder.ts:451`) exist and are **never called** — a
  repo-wide grep for `pushCadence|pushPower|pushTemperature` returns only their own definitions. So
  `MetricId` members `"cadence"`, `"power"`, `"temperature"` (`icefall-app/src/tracking/types.ts:143-146`)
  are **declared but never populated**.

---

#### 4.8 How wearable data reaches (and fails to reach) the coach — the trace

```
BLE strap ──► recorder.pushHeartRate ──► RecordedActivity.avgHeartRateBpm
Watch import ─► watchActivityToRecorded ─► RecordedActivity.avgHeartRateBpm
                                              │
                                              ▼
                        sessionLoadDetail  (coach/load.ts:154-203)
                          hr in [60,220] → intensity = 0.55…1.55  (lines 168-176)
                          else           → intensity = metEstimate/8 (line 178)
                                              │
                                              ▼
                        computeTrainingLoad (coach/load.ts:272)
                                              │
                                              ▼
                        trainingComponent (coach/readiness.ts:144) — weight 0.30
```

```
Oura ──► oura_* tables ──► /api/oura/summary ──► ouraService.summary()
                                                     │
                                  ┌──────────────────┴──────────────────┐
                                  ▼                                     ▼
                   HealthSources.tsx (renders)              resolveVitals ──► coachVitalInputs
                                                                                 │
                                                                          ✗ NO CALLER
Apple Health / Health Connect ──► (no bridge exists) ──────────────────────────┘

coach/hooks.ts:69-78 →  assessRecovery({ restingHeartRateBpm: undefined,
                                          sleepMinutes: undefined, … })
```

Verbatim, `icefall-app/src/coach/hooks.ts:66-75`:

```
    // Resting heart rate and sleep would come from the Health bridge. No browser
    // exposes them, so they are explicitly absent rather than filled in — see
    // src/tracking/sources/health.ts for the same convention.
    const recovery = assessRecovery({
      checkIn: todaysCheckIn,
      // undefined, not null: null claims the source was consulted and had no
      // data for last night, which reads to the athlete as "you failed to log
      // it". There is no source at all — no browser exposes either metric.
      restingHeartRateBpm: undefined,
      sleepMinutes: undefined,
```

Consequences inside `assessRecovery` (`icefall-app/src/coach/recovery.ts`):

- `sleepDuration` (weight `0.10`, `recovery.ts:101`) always resolves to
  `reason: "not-connected"` (lines 209-211) and never scores.
- `restingHeartRate` carries `weight: 0` **by design** (line 249) — even when a value exists it is
  "Shown, never scored" (comment, lines 232-235), because there is no personal baseline.
- So of the eight declared recovery weights, only the five check-in sliders plus `loadRatio` (0.07)
  and `hardSession` (0.05) can ever contribute; `sleepDuration`'s 0.10 is permanently dead weight
  and renormalises away.

**The AI prompt.** `systemPromptFor` (`icefall-app/src/coach/context.ts:140-159`) embeds
`describeState(ctx)`, which contains the readiness score, `recovery.summary`, acute/chronic load,
the prescribed session, and the raw check-in JSON (`context.ts:301-341`). **No wearable metric of
any kind is in it.** Because `restingHeartRateBpm`/`sleepMinutes` are `undefined`,
`recovery.summary` will contain the literal string fragment
`Not counted: sleep recorded (not connected), resting heart rate (not connected).`
(assembled at `recovery.ts:366-370, 439`), so the model is told, in words, that no wearable is
attached.

**The model is not even called in this build.** `ENDPOINT` reads `VITE_COACH_ENDPOINT`
(`icefall-app/src/services/coach.ts:28`), which is absent from `.env.local`; `askCoach` only takes
the network path `if (ENDPOINT && !DEMO)` (`services/coach.ts:222`) and otherwise returns
`scripted(question, ctx)` (line 279). The file's own comment at line 220 says: "`ENDPOINT` is unset
in this build, so the scripted coach already answers everything".

---

### 5. Readiness

#### 5.1 Which readiness — there are three unrelated things called "readiness"

1. **`computeReadiness`** — `icefall-app/src/coach/readiness.ts:643`. The daily 0-100 "how well
   does today suit hard work" score. **GLOBAL, not per-mountain.** Discussed below.
2. **`assessObjectiveReadiness`** — `icefall-app/src/coach/mountainReadiness.ts:1140`. A separate,
   **per-mountain** assessment (fitness / technical / altitude / experience), weakest-link, using
   recorded activities, logged summits and self-report. It reads **no wearable data at all**
   (grep for `hrv|sleep|restingHeart|oura` in that file returns only two prose comments).
3. **Operator "readiness"** — `icefall-operator/src/screens/Participants.tsx:58` — an entirely
   different concept: paperwork completeness. Verbatim:
   `"Readiness means the information is complete. It is not a medical, fitness or safety judgement."`
   and `icefall-operator/src/domain/crm/notices.ts:19-20`:
   `"Readiness describes whether information has been received and looked at. It is not a medical, fitness or safety assessment, and nothing here clears a person to go."`

The rest of this section is about (1).

#### 5.2 Is any AI involved?

**No. `readiness.ts` is pure arithmetic.** It imports only `activityById`, the `known`/`unavailable`
helpers and types (`readiness.ts:1-7`). No fetch, no model, no randomness. The output *feeds* the
AI prompt (`context.ts:301-306`); the AI never produces it. The prompt explicitly forbids the model
from inventing one: `` `Readiness: NOT COMPUTABLE today (…). Do not state a readiness number.` ``
(`context.ts:304`).

#### 5.3 The exact formula

**Four components, fixed weights** (`readiness.ts:87-92`):

```
const WEIGHTS: Record<string, number> = {
  training: 0.3,
  recovery: 0.3,
  consistency: 0.2,
  "goal-alignment": 0.2,
};
```

**Aggregation** (`readiness.ts:662-683`):

```
available = components with score.value !== null
if (available.length < MIN_COMPONENTS)   → score = unavailable(dominantReason(missing))
else
  totalWeight = Σ WEIGHTS[c.id] over available
  if (totalWeight <= 0)                  → score = unavailable(dominantReason(missing))
  else score = round( clamp(0..100, Σ WEIGHTS[c.id] * c.score.value / totalWeight) )
```

`MIN_COMPONENTS = 3` (`readiness.ts:95`). ⚠️ Its own comment on line 94 reads *"Fewer than two
computable components and the number is not worth printing"* — **the comment says two, the
constant is three.** The header comment (line 24) is the accurate one: "Lose two of the four and
the number is withdrawn entirely."

Weights **renormalise** over surviving components rather than defaulting a missing one to its mean
(comment, lines 666-668).

##### Component 1 — `training` (weight 0.30)

`trainingComponent(load)` (`readiness.ts:144-189`). It does **not** compute anything; it maps
`TrainingLoad.trend` to a fixed score:

| `load.trend` | score | line |
|---|---|---|
| `insufficient-data` or `ratio === null` | `unavailable("too-little-history")` | 145-151 |
| `spike` | `known(32)` | 164 |
| `ramping` | `known(84)` | 171 |
| `steady` | `known(90)` | 178 |
| `detraining` | `known(58)` | 185 |

`load.ratio` is acute(7-day)/chronic(28-day) from `computeTrainingLoad`
(`icefall-app/src/coach/load.ts:272`), whose per-session load is
`minutes * intensity + (ascent_m / 100) * 6` (`load.ts:193, 196`), with `intensity` from
heart rate when available and from the activity type's MET estimate otherwise (`load.ts:168-186`).

##### Component 2 — `recovery` (weight 0.30)

`recoveryComponent(recovery)` (`readiness.ts:208-234`). **Passed straight through**, unmodified:
`score: { value: recovery.score.value }` (line 231). When `recovery.score.value === null` it becomes
`unavailable(recovery.score.reason ?? "not-reported")` (line 213).

`recovery.score` itself (`icefall-app/src/coach/recovery.ts:299-317`) is the weighted mean over
inputs where `unit !== null && weight > 0`, renormalised, **and gated on at least one self-reported
slider** (`selfReportedScored`, line 307) — with no check-in it is `{ value: null, reason:
"not-reported" }` regardless of load data. Weights (`recovery.ts:95-104`):
`energy 0.24, soreness 0.22, sleep 0.14, stress 0.10, motivation 0.08, sleepDuration 0.10,
loadRatio 0.07, hardSession 0.05`.

##### Component 3 — `consistency` (weight 0.20)

`consistencyComponent(facts)` (`readiness.ts:347-385`) over a 28-day window (`WINDOW_DAYS = 28`,
line 51):

```
perWeek     = activeDays / (28/7)
frequency   = clamp01( perWeek / 4 )                       // FREQUENCY_CEILING_DAYS_PER_WEEK = 4
gap         = longestGapDays ?? 0                          // includes the still-running trailing gap
regularity  = clamp01( 1 - (gap - 3) / (10 - 3) )          // GAP_FORGIVEN_DAYS=3, GAP_EXHAUSTED_DAYS=10
score       = (0.6 * frequency + 0.4 * regularity) * 100
```

`longestGapDays` deliberately includes the silence since the last session (`readiness.ts:293-307`).

##### Component 4 — `goal-alignment` (weight 0.20)

`goalAlignmentComponent(facts, goalPreparation)` (`readiness.ts:401-436`):

```
ascentPerWeek = totalAscentM / (28/7)
vertical      = clamp01( ascentPerWeek / 1500 )            // ASCENT_CEILING_M_PER_WEEK = 1500
specificity   = clamp01( specificSessions / window.length )
shape         = 0.55 * vertical + 0.45 * specificity
prepared      = clamp01( goalPreparation / 100 )
score         = (0.7 * shape + 0.3 * prepared) * 100
```

`specificSessions` counts sessions whose activity type has `verticalFocus`, **or** whose
`elevationGainM >= 400` (`readiness.ts:320`).

##### Data hygiene applied before any of this

`realOnly()` (`readiness.ts:269-271`) drops `simulated === true`. `useCoachIntel` filters the same
set again at `hooks.ts:63`.

#### 5.4 Minimum data required

| Component | Minimum | Line |
|---|---|---|
| `training` | `load.trend !== "insufficient-data"` **and** `load.ratio !== null` | 145 |
| `recovery` | ≥1 self-reported check-in slider today | `recovery.ts:307-317` |
| `consistency` | `historyDays >= 14` **and** ≥3 sessions in the last 28 days | 66-67, 360 |
| `goal-alignment` | a `goalPreparation` value **and** ≥3 sessions in the last 28 days | 405, 414 |
| **overall score** | ≥3 of the 4 computable, with total surviving weight > 0 | 95, 670-676 |

#### 5.5 What is displayed when it cannot be computed — verbatim

**The withheld-score paragraph** (`readiness.ts:504-511`, template literal reproduced exactly):

```
`ICEFALL is not putting a number on today: ${missingLabels.length} of the four components cannot be computed — ${needed}.`
```
followed by the `hardLine` and then, verbatim:
> "A readiness score built on one or two components would read like a verdict on everything, so it is withheld until there is more to go on."

**The `hardLine`** (`readiness.ts:497-502`), three cases verbatim:
> "Nothing is recorded yet, so there is no session history behind this."

```
`Nothing on record meets ICEFALL's threshold for a hard session; your most recent activity of any kind was ${describeElapsed(facts.lastSessionHoursAgo)}.`
```
```
`Your last hard session was ${describeElapsed(facts.lastHardHoursAgo)}.`
```

**Guidance when the score is null** (`readiness.ts:598-603`):

```
`Train to how you feel today and keep it moderate, because ICEFALL cannot see enough to advise properly — ${listLabels(missingLabels)} ${missingLabels.length === 1 ? "is" : "are"} missing.`
```
> "Log a check-in and record your sessions, and the guidance sharpens quickly."

**Per-component "not enough data" notes**, verbatim:

- `training` (`readiness.ts:150`): "Not enough recorded training yet to compare this week against your normal pattern."
- `recovery` (`readiness.ts:214`): "No check-in logged, so recovery is unknown rather than assumed to be average."
- `consistency`, nothing at all (`readiness.ts:356`): "Nothing recorded yet, so there is no pattern to read."
- `consistency`, too thin (`readiness.ts:365`):
  ```
  `${facts.window.length} session${facts.window.length === 1 ? "" : "s"} on record in the last ${WINDOW_DAYS} days — too few to judge a pattern.`
  ```
- `goal-alignment`, no objective (`readiness.ts:410`): "No objective set, so there is nothing to align your training against."
- `goal-alignment`, too thin (`readiness.ts:419`):
  ```
  `Only ${facts.window.length} session${facts.window.length === 1 ? "" : "s"} in the last ${WINDOW_DAYS} days — not enough to say what kind of work you have been doing.`
  ```

**Which reason wins when the score is withheld** — `REASON_PRIORITY` (`readiness.ts:447-453`):
`["too-little-history", "not-reported", "needs-permission", "not-connected", "no-data"]`.

**Generic reason copy**, verbatim from `icefall-app/src/components/coach/DataState.tsx:95-116`:

```
  "not-reported": { title: "Not reported",     detail: "You haven't logged this yet." },
  "not-connected": { title: "No sensor",        detail: "Connect a supported device to see this." },
  "needs-permission": { title: "Permission needed", detail: "Allow ICEFALL access to this source to see it." },
  "too-little-history": { title: "Not enough data", detail: "We need more history to calculate this." },
  "no-data": { title: "Not enough data",        detail: "We need more data to calculate this." },
```

Short forms in `icefall-app/src/coach/types.ts:40-46`: `"Not recorded"`, `"No source connected"`,
`"Permission needed"`, `"Not enough history yet"`, `"Not reported"`.

#### 5.6 Band words

`band()` (`readiness.ts:470-476`) — used in the explanation paragraph:
`>=80` "well placed for a demanding session"; `>=65` "in good shape for the session as prescribed";
`>=50` "workable, with the intensity kept honest"; `>=35` "better suited to easy work today";
else "pointing firmly towards rest or very easy movement".

`readinessWord()` (`readiness.ts:710-716`) — the one word beside the ring:
`>=80` "Strong"; `>=65` "Ready"; `>=50` "Moderate"; `>=35` "Easy"; else "Rest".

#### 5.7 Guidance ordering (hold-backs win over the number)

`buildGuidance` (`readiness.ts:538-637`) returns early, in this order, so no arithmetic can
outvote a hold-back:
0. `recovery.flagForProfessional` → "Have this assessed before you train hard again." (line 558)
1. `recovery.status === "poor"` **or** `recoveryScore <= 45` (`RECOVERY_HOLD_BACK`, line 98)
2. `load.trend === "spike"`
3. last hard session < 24 h ago
4. `score === null`
5. numeric bands at `>=75`, `>=55`, `>=40`, else rest.

#### 5.8 What the Readiness screen actually renders

`icefall-app/src/screens/coach/ReadinessScreen.tsx`. `buildFactors` (line 193-249) renders **six**
rows, which are **not** the four scoring components:

1. `recovery` — from the component.
2. **`hrv` — HARD-CODED `unavailable("not-connected")` at line 217**, note verbatim (line 218):
   "ICEFALL cannot read heart-rate variability. No browser exposes it and no wearable is linked, so there is nothing here to show."
3. **`sleep` — HARD-CODED `unavailable("not-connected")` at line 223**, note verbatim (line 224):
   "No sleep source is connected. Last night is not in this number, and nothing has been assumed about it."
4. `training`, relabelled **"Recent load"** (line 229).
5. `stress` — computed on the screen from `checkIn.stress`, inverted (line 240). **Not a scoring
   component.**
6. `consistency` — from the component.

Two consequences a redesign must know:

- **`goal-alignment` carries 0.20 of the score and is never shown on this screen.**
- **The HRV and Sleep rows are static JSX.** They say "not connected" even for an athlete with a
  live Oura connection whose HRV and sleep are visible on `/settings/health-sources`. Nothing reads
  `ouraService` or `useVitals` here.

The trend chart is recomputed historically and is **not stored** — the screen says so verbatim
(lines 382-388): "ICEFALL does not store a daily readiness score, so these points are recalculated
from the sessions and check-ins recorded at the time."

---

### 5.9 What operators see on an incoming enquiry

**Readiness is NOT sent to operators. Neither is any health, wearable, training-load or
preparation figure.** Plainly: an operator receiving an ICEFALL enquiry sees free text, a mountain
name, a first name and timestamps.

##### The composer

`icefall-app/src/screens/Inbox.tsx`, `ComposeEnquiry` (line 57). The draft body is produced by
`draftEnquiry` (`icefall-app/src/services/operators.ts:877-899`) — **verbatim, in full**:

```
    `I'm planning an ascent of ${args.peakName} (${args.elevationM.toLocaleString("en-GB")} m), targeting ${when}.`,
    "",
    "Could you send me:",
    "• Your available departures and the route you run",
    "• Guide-to-client ratio on technical ground",
    "• What the price includes and excludes (permits, park fees, oxygen, insurance)",
    "• The experience you expect clients to arrive with",
    "• Your emergency and evacuation plan",
    "",
    "Thank you.",
```

`draftEnquiry` accepts a `preparation?: number` argument (`operators.ts:881`) and Inbox passes
`goal?.preparation` (`Inbox.tsx:74`) — **but the function body never uses it.** No preparation
percentage, and certainly no readiness, appears in the drafted text. The athlete may of course type
anything into the free-text box.

##### What is transmitted

`sendEnquiry` (`icefall-app/src/enquiries/send.ts:98-136`) calls exactly one RPC with exactly four
arguments (lines 121-126, re-read and confirmed):

```
  const { error } = await supabase.rpc("open_enquiry", {
    p_body: args.body,
    p_destination_id: destinationId,
    p_origin_app: "phone_app",
    p_origin_screen: args.originScreen,
  });
```

`EnquiryOriginScreen` declares `"trip_detail" | "trek_detail" | "inbox_new"`
(`send.ts:52`), but a repo-wide grep shows **only `"inbox_new"` is ever passed**
(`Inbox.tsx:121`) — `sendEnquiry`/`enquiryGate` have no other call sites. The other two are
declared but unused.

##### The stored row

`public.enquiries` (`icefall-supabase/migrations/20260831110000_enquiries.sql:26-73`) columns:
`id, created_at, sender_id, sender_kind, sender_email, sender_name, origin_app, origin_screen,
product_id, destination_id, company_id, object_label, body, seen_at, seen_by, answered_at,
answered_by, answer` — later gaining `handed_off_at, handed_off_by`
(`20260831150000_enquiry_delivery.sql:29-31`). **There is no readiness, preparation, fitness,
health or activity column, and no join to one.**

##### The operator's view

`public.operator_enquiries` (`icefall-supabase/migrations/20260831150000_enquiry_delivery.sql:133-154`
— **line range corrected in the verification pass**; the first draft cited `:55-75`, which is the
`enquiries_guard()` trigger function, not the view) — reproduced verbatim, this is the complete
column list an operator can reach:

```
    e.id,
    e.created_at,
    e.company_id,
    e.product_id,
    e.destination_id,
    e.object_label,
    e.body,
    -- A first name to address; never the address to reach around ICEFALL.
    e.sender_name,
    e.origin_app,
    (e.seen_at is not null) as seen,
    e.answered_at,
    e.answer,
    e.handed_off_at
  from public.enquiries e
  where e.handed_off_at is not null
    and public.is_company_member(e.company_id);
```

Two gates, both in the `where` clause above: the enquiry must have been **manually handed off by a
named staff member** (`handed_off_at`), and the reader must be a member of that company. The
hand-off is guarded by `public.enquiries_guard()` (that migration, `:54-95`): a hand-off is stamped
once and cannot be re-dated or re-attributed (`:80-84`), is refused when the enquiry names no
company (`:85-88`), and must be stamped by the person doing it — `new.handed_off_by is distinct
from auth.uid()` raises (`:89-91`). `sender_email`, `sender_id` and `origin_screen` are deliberately
excluded, and the view's own comment (`:156-161`) says so. Grants: `revoke all … from public, anon`
then `grant select … to authenticated` (`:163-164`).

##### Does the operator portal even read it?

**No.** A grep for `operator_enquiries` across `icefall-operator/src` returns **nothing**; the only
hit anywhere in that project is a security probe, `icefall-operator/tests/live-rls.probe.ts:146`.
The operator app's inbound queue reads the separate `leads` table, whose column list is
(`icefall-operator/src/backend/supabaseLeads.ts:209-210`):

```
"id,company_id,customer_id,thread_id,product_id,destination_id,status,origin,tags,assigned_to,booking_id,source_page,created_at,contacted_at,qualified_at,quoted_at,booked_at,lost_at,lost_reason"
```

No health, fitness or readiness field there either. A repo-wide grep of `icefall-operator/src` for
`hrv|resting_heart|oura|vo2` returns zero hits; every hit for `readiness` is the paperwork-
completeness concept documented in 5.1.

##### What the athlete is told the Send button does

`icefall-app/src/screens/Inbox.tsx:43-45`, verbatim:

```
  return `This goes to ICEFALL's desk, not to the operator. ICEFALL answers it, and the reply will go to ${email}. Nothing here books or holds anything.`;
```

and on the paths where nothing is transmitted (`Inbox.tsx:31-32`), verbatim:

> "Held on this device. ICEFALL has no operator network connected yet, so this message has not been transmitted and no reply will arrive. Contact the operator directly to book anything."

---

### Appendix — comments in this area that are false or misleading

| Location | The claim | The code |
|---|---|---|
| `icefall-web/api/_oura.mjs:29-38` | "WHAT REACHES A SCREEN TODAY … Nothing." | `HealthSources.tsx:283-301` renders all 19 metrics. |
| `icefall-app/src/tracking/sources/vitals.ts:359-372` | The `undefined` vs `null` distinction "is now load-bearing rather than decorative". | `coachVitalInputs` has zero call sites; `coach/hooks.ts:74-75` hard-codes `undefined`. |
| `icefall-app/src/tracking/sources/useOura.ts:50-56` | "This is what a coach screen should read." | No coach screen calls `useVitals`. |
| `icefall-app/src/coach/readiness.ts:94` | "Fewer than two computable components…" | `MIN_COMPONENTS = 3` on the next line. |
| `icefall-app/src/screens/coach/ReadinessScreen.tsx:31-36` | "only three of them have a data source in this build" | Four of the six rows have a source (recovery, training, stress, consistency); HRV and Sleep are static. The count is off by one and drifts further once a ring is connected. |
| `icefall-app/src/coach/hooks.ts:66-68` | "No browser exposes them" | True of the browser, but an Oura connection *does* expose both server-side; the sentence is now the reason a live source is ignored. |
| `icefall-app/src/watch/map.ts:14-35` | Describes the sport map as pending real vendor responses | Accurate today — all four maps are `{}` and everything falls to `"other"`. |
| `icefall-app/src/screens/Inbox.tsx:15-18` | "ICEFALL has none connected, so nothing leaves the device" | Partially stale by design; the file itself amends it per path via `enquiryGate` (comment lines 21-30 explain this). Signed-in + known peak *does* transmit. |

---

### Verification pass — 2026-09-11

An independent re-check re-ran every count and re-opened every cited file. What changed is marked inline as **CORRECTION** or noted in the paragraph it affects. Summary:

- **CORRECTED (material):** Mont Blanc is in elevation band **6**, not band 5. The claim that it and the Matterhorn share a derived requirement set was wrong. §6.8 now carries the full band-by-band sort of all 14 curated mountains, and a true example.
- **CORRECTED:** 20 of the 26 trek-referenced mountain ids are unresolvable (not 12); only 6 resolve.
- **CORRECTED:** `peak-photos.json` holds 7,549 photo rows, not 7,553.
- **CORRECTED:** there are now **three** Supabase edge-function directories, not two — `health/` was created by another session *during this audit* and is described in §7.6. It cannot run: none of the four tables it queries exists in any migration.
- **CORRECTED:** several `mountains.ts` and `MountainPage.tsx` line numbers.
- **RESOLVED (was uncertain):** the built service worker has no push handler — `grep -c push` over `icefall-app/dist/sw.js` and `icefall-app/dist-verify/sw.js` returns 0 in both, as do `periodicsync` and `showNotification`.
- **RESOLVED (was uncertain):** **1,170 of the 77,141** bundled trail rows carry a non-null `sac_scale` (1.5%). The only human-assigned difficulty grade in the app's bulk data is present on one row in sixty-six.
- **RE-CONFIRMED unchanged:** 14 mountains, 21 routes, 3 expeditions, 252 treks, 53,668 peaks, 77,141 trails (22 files, manifest sums to the same), 33,181 peak-fact entities, 92 `TREK_ROUTES` of 252, and every per-field trek tally (difficulty 108/84/49/6/null 5; 11 null durations; 38 null altitudes; 7 null seasons; 0 prices; 0 operatorIds; 0 guideIds; 45 with mountainIds; 22 of 22 regions; the style histogram).
- **RE-CONFIRMED unchanged:** the whole of §7 (proactive behaviour). Every grep was re-run: zero matches for `pushManager`, `PushSubscription`, `new Notification(`, `Notification.requestPermission`, `showNotification`, `periodicSync`, `backgroundSync`, `BackgroundSyncPlugin`, `applicationServerKey`, `vapid`, `gcm_sender_id` across `src/`, `public/`, `vite.config.ts`, `package.json`, `index.html`; zero for `.channel(`, `postgres_changes`, `removeChannel`; exactly one `cron.schedule` in 69 migrations; no `crons` key in `vercel.json`; the eight notification toggles have consumers in exactly three files (the settings screen, `settings/store.ts`, `state/AppState.tsx`) and nowhere else.
- **Migration count:** 69 `.sql` files in `icefall-supabase/migrations`, not 68.
- **Whether any of these migrations is applied to the live Supabase project cannot be determined from the repository.** Nothing in the repo records a deployment state, and `icefall-app/src/settings/sync.ts:25-34` argues at length that a deployment state written into a comment is unreliable. Every DB statement in this section is a statement about the migration file, not about the live database.

---

### 6. Mountain, route, trek and expedition data

All paths below are relative to `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/` unless written in full.

#### 6.0 Where objective data actually lives — and where it does not

There are **four separate, unconnected objective datasets** in the phone app, plus a fifth in the database that the phone app never reads.

| Dataset | Storage | Count | Read by |
| --- | --- | --- | --- |
| Curated mountains (`Mountain`) | TypeScript literal, `icefall-app/src/data/mock/mountains.ts:8` | **14** | `icefall-app/src/services/repository.ts:41,67` |
| Mountain routes (`MountainRoute`) | nested inside the 14 mountain records | **21** | `icefall-app/src/routes/model.ts:85-87` |
| Expeditions (`Expedition`) | TypeScript literal, `icefall-app/src/data/mock/social.ts:115` | **3** | `icefall-app/src/services/repository.ts:55,78` |
| Treks (`Trek`) | generated TypeScript, `icefall-app/src/treks/records.ts:15` | **252** | `icefall-app/src/treks/index.ts:41` |
| Reference peaks (`PackedPeak`) | static JSON, `icefall-app/public/data/peaks.json` | **53,668** | `icefall-app/src/services/peaks.ts:99` (`BUNDLE_URL = "/data/peaks.json"`) |
| Bundled OSM trails | static JSON, `icefall-app/public/data/trails/r*.json` (22 files) | **77,141** | `icefall-app/src/services/trails.ts:451` |
| Harvested Wikidata peak facts | static JSON, `icefall-app/public/data/peak-facts/{0..15}.json` | **33,181** entities | `icefall-app/src/services/peakFacts.ts` |
| CRM `destinations` / `products` tables | Supabase migrations | n/a (no seed counted here) | **nothing in the phone app** |

**The phone app never queries any mountain/trek/expedition table in Supabase.** Enumerating every `.from("…")` call under `icefall-app/src/` returns only: `athlete_profiles, blocks, channel_members, channel_message_stats, channel_message_views, channel_messages, channels, follows, group_join_requests, group_members, group_messages, groups, highlight_items, highlights, interest_tags, messages, post_comments, post_likes, posts, profiles, promoted_dismissals, promoted_placement_views, promoted_placements, reports, summit_logs, thread_participants, threads`. `destinations`, `products`, `product_destinations`, `product_departures` and `trek_mountains` do **not** appear. So for a coach redesign: **every objective the coach can reason about is a compile-time constant or a static JSON file in the client bundle.**

---

#### 6.1 `Mountain` — the curated objectives (14 records)

Type: `icefall-app/src/types/index.ts:213-260`.

| Field | Type | Notes (file:line of the declaration) |
| --- | --- | --- |
| `id` | `string` | slug, `types/index.ts:214` |
| `coords` | `{ lat: number; lon: number }` | `:215` — "Real summit coordinates, used to centre the terrain map." |
| `name` | `string` | `:217` |
| `range` | `string` | `:218` |
| `country` | `string` | `:219` — compound on border peaks ("France / Italy") |
| `elevationM` | `number` | `:220` |
| `difficulty` | `Difficulty` (`1 \| 2 \| 3 \| 4 \| 5`) | `:221`; scale declared at `types/index.ts:30` — "1 = accessible, 5 = extreme." |
| `difficultyLabel` | `string` | `:222` — free text, does **not** come from an enum |
| `bestSeasons` | `Season[]` (`"spring" \| "summer" \| "autumn" \| "winter"`) | `:223`, `:32` |
| `typicalDurationLabel` | `string` | `:224` — free text ("2–3 days", "50–60 days") |
| `technicalRequirements` | `string[]` | `:225` — **free-text skill list** |
| `requiredExperience` | `string` | `:226` — **one free-text prose sentence** |
| `trainingRequirements` | `string[]` | `:227` — **free-text training volume list** |
| `recommendedGearIds` | `string[]` | `:228` |
| `routes` | `MountainRoute[]` | `:229` |
| `conditions` | `Conditions` | `:230` — a *hardcoded* weather snapshot baked into the fixture, not live |
| `permitIssuedToOperator` | `true \| undefined` | `:245` |
| `photo` | `string` | `:246` |
| `photoCredit` | `string \| undefined` | `:256` |
| `summary` | `string` | `:257` |
| `requiresProfessionalSupport` | `boolean` | `:259` |

Every one of the 14 records, read out of `icefall-app/src/data/mock/mountains.ts`:

| id | line | elev | `difficulty` | `difficultyLabel` | `bestSeasons` | `typicalDurationLabel` | routes | `requiresProfessionalSupport` | `permitIssuedToOperator` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| everest | :10 | 8849 | 5 | Extreme | spring | 50–60 days | 2 | true | true |
| k2 | :70 | 8611 | 5 | Extreme | summer | 6-8 weeks base to base | 2 | true | true |
| broad-peak | :149 | 8051 | 5 | High-altitude expedition | summer | 45-55 days round trip from Islamabad | 2 | true | true |
| kilimanjaro | :227 | 5895 | 2 | High-altitude trek | winter, summer, autumn | 6-9 days on the mountain | 2 | true | true |
| annapurna | :301 | 8091 | 5 | Extreme | spring | 35-40 days | 2 | true | true |
| mont-blanc | :378 | 4806 | 4 | Serious alpine | summer | 2–3 days | 2 | true | — |
| matterhorn | :444 | 4478 | 5 | Technical alpine | summer | 2 days | 1 | true | — |
| denali | :499 | 6190 | 5 | Extreme cold expedition | spring, summer | 17–21 days | 1 | true | — |
| aconcagua | :548 | 6961 | 4 | High-altitude expedition | summer | 18–21 days | 1 | true | — |
| eiger | :597 | 3967 | 5 | Technical alpine | summer, winter | 1–3 days | 2 | true | — |
| gran-paradiso | :662 | 4061 | 3 | Introductory alpine | summer | 2 days | 1 | **false** | — |
| mount-olympus | :716 | 2918 | 3 | Demanding hike / scramble | summer, autumn | 2 days | 1 | **false** | — |
| triglav | :765 | 2864 | 3 | Via ferrata / scramble | summer, autumn | 2 days | 1 | **false** | — |
| toubkal | :812 | 4167 | 2 | High-altitude trek | spring, autumn, winter | 2–3 days | 1 | **false** | — |

(The `id:` line numbers for the last eight rows were off by 1–7 in the first draft and are corrected above; elevations, difficulties, labels, seasons, durations, route counts and both boolean columns were re-read and are unchanged.)

Note the comment in `icefall-app/src/treks/index.ts:29-30` says "this app holds 10 curated objectives". **That is stale — there are 14** (`icefall-app/src/data/mock/mountains.ts`, ids listed above; `icefall-app/src/services/peakTier.ts:8` says "Fourteen of them have been written up by a person", which agrees with the code).

---

#### 6.2 `MountainRoute` — 21 records, nested in the mountains

Type: `icefall-app/src/types/index.ts:203-211`.

```
export interface MountainRoute {
  name: string;
  difficulty: Difficulty;
  gradeLabel: string;
  durationLabel: string;
  distanceKm: number;
  elevationGainM: number;
  description: string;
}
```

`gradeLabel` is **free text**, not an enum. Observed values include `"PD"`, `"AD"` (Mont Blanc, `icefall-app/src/data/mock/mountains.ts:411,423`) and `"Expedition"` (Everest, `:37,47`).

A worked example, verbatim from `icefall-app/src/data/mock/mountains.ts:409-417`:

```
      {
        name: "Goûter Route",
        difficulty: 4,
        gradeLabel: "PD",
        durationLabel: "2 days",
        distanceKm: 19.4,
        elevationGainM: 2400,
        description:
          "The standard line via Tête Rousse and the Goûter hut. Objective rockfall danger in the Grand Couloir makes early timing non-negotiable.",
      },
```

`icefall-app/src/routes/model.ts` lifts these into a flat `Route` type (`:29-45`) adding `id`, `mountainId`, `mountainName`, `mountainElevationM`, `mountainLat`, `mountainLon`, `country`, `range`, `photo`, `kind` and `multiDay`. `kind` is **derived by regex over the route's own name+description** (`routes/model.ts:56-63`) — `traverse | approach | acclimatisation | training | summit`, defaulting to `summit`. `multiDay` is a regex on `durationLabel` (`:65`).

`routeDemands()` (`icefall-app/src/routes/model.ts:121-163`) derives a 4-or-5 item demand profile from the route's own numbers with hardcoded thresholds:
- Vertical endurance: `level(gain, 900, 1600)` — `:128`
- Aerobic endurance: `level(km, 12, 20)` — `:133`
- Technical skill: `level(route.difficulty, 3, 5)` — `:140`
- Pack endurance: `"very-high"` if multi-day else `level(gain, 1000, 1800)` — `:146`
- Altitude: added **only** when `route.mountainElevationM >= 3000`, `level(elev, 4000, 6000)` — `:154-161`

`level()` at `:110-111` returns `"very-high" | "high" | "moderate"` — ordinal, never numeric.

Ratings shown against routes are **invented** and the file says so: `icefall-app/src/routes/ratings.ts:4-7` — "⚠️ THESE NUMBERS ARE INVENTED. Nobody can rate a route, so nobody has rated anything." `SHOW_DEMO_RATINGS = true` at `:26`, so they are live in the build; `ratingFor()` (`:48-57`) hashes the id into stars 4.3–4.9 and a "people" count 40–900.

---

#### 6.3 `Expedition` — 3 records

Type: `icefall-app/src/types/index.ts:269-284`. Data: `icefall-app/src/data/mock/social.ts:115-182`.

```
export interface Expedition {
  id: string;
  mountainId: string;
  name: string;
  elevationM: number;
  durationLabel: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  requiredExperience: string;
  priceFromEur: number;
  seasons: string[];
  operators: ExpeditionOperator[];
  prerequisites: string[];
  photo: string;
  summary: string;
}
```

The three records are `exp-everest` (`social.ts:117`), `exp-aconcagua` (`:142`), `exp-denali` (`:162`). Verbatim example, `icefall-app/src/data/mock/social.ts:142-160`:

```
  {
    id: "exp-aconcagua",
    mountainId: "aconcagua",
    name: "Aconcagua — Normal Route",
    elevationM: 6961,
    durationLabel: "18–21 days",
    difficulty: 4,
    difficultyLabel: "High altitude",
    requiredExperience: "Strong hill fitness and prior experience above 4,500 m.",
    priceFromEur: 5400,
    seasons: ["December – February"],
    operators: [
      { name: "Andes Vertical", certification: "AAGM certified, Mendoza-permitted" },
      { name: "Cordillera Guides", certification: "IFMGA-led" },
    ],
    prerequisites: ["Prior multi-day expedition", "Ability to carry 18 kg", "Medical clearance"],
    photo: "/img/aconcagua.jpg",
    summary:
      "The highest summit outside Asia and the conventional proving ground before attempting an 8,000 m peak.",
  },
```

`seasons` here is `string[]` of free text ("December – February"), **not** the `Season` union used on `Mountain`. The two are not interconvertible.

The 5 `IcefallEvent` records (`icefall-app/src/data/mock/social.ts:8-107`) also carry a `requirements: string[]` (type at `types/index.ts:405`), e.g. `["Comfortable on steep snow", "Own boots and harness", "Basic fitness for 6 h days"]` (`social.ts:21-25`).

---

#### 6.4 `Trek` — 252 records, 22 regions

Type: `icefall-app/src/treks/model.ts:54-89`. Data: `icefall-app/src/treks/records.ts:15` (generated; header at `:3-14` says "GENERATED — do not hand-edit").

| Field | Type | Line |
| --- | --- | --- |
| `id` | `string` (slug) | `model.ts:56` |
| `name` | `string` | `:57` |
| `regionId` | `string` | `:58` |
| `country` | `string` | `:59` |
| `mountainIds` | `string[]` | `:69` — "MAY BE EMPTY, and often is" |
| `durationDays` | `[number, number] \| null` | `:71` |
| `difficulty` | `TrekDifficulty \| null` | `:72` |
| `maxAltitudeM` | `number \| null` | `:74` — "Highest point ON THE ROUTE — never the summit of a mountain beside it." |
| `season` | `string \| null` | `:76` — free text, e.g. `"March – May, September – November"` |
| `priceFromEur` | `Cents \| null` | `:82` — "ALWAYS NULL at present" |
| `style` | `TrekStyle` | `:83` |
| `summary` | `string` | `:84` |
| `operatorIds` | `string[]` | `:86` |
| `guideIds` | `string[]` | `:88` |

`TrekDifficulty` (`model.ts:34`) is its own 4-value scale, deliberately **not** the `Difficulty` 1–5 used for mountains and routes:
```
export type TrekDifficulty = "Easy" | "Moderate" | "Strenuous" | "Very strenuous";
```
`TrekStyle` (`model.ts:44-52`): `"Base camp" | "Circuit" | "Traverse" | "Valley" | "High pass" | "Pilgrimage" | "Coastal" | "Long distance"`.

Measured over all 252 records in `icefall-app/src/treks/records.ts`:

- difficulty: Strenuous 108, Moderate 84, Very strenuous 49, Easy 6, **null 5**
- `durationDays === null`: **11**
- `maxAltitudeM === null`: **38**
- `season === null`: **7**
- `priceFromEur` non-null: **0** (confirms the `model.ts:78` claim)
- `operatorIds` non-empty: **0**
- `guideIds` non-empty: **0**
- `mountainIds` non-empty: 45 records, referencing 26 distinct ids
- style: Traverse 70, Circuit 59, Long distance 32, Valley 26, High pass 25, Pilgrimage 16, Coastal 13, Base camp 11
- regions used: 22 of the 22 declared at `icefall-app/src/treks/model.ts:107-130`

**Only 21 of the 252 treks resolve to a mountain page in the phone app.** `peaksForTrek` (`icefall-app/src/treks/index.ts:56-57`) filters `mountainIds` against `LOCAL_PEAKS` — the 14 curated ids (`:47`) — and **20 of the 26** referenced ids have no mountain record here: `alpamayo`, `ama-dablam`, `aoraki`, `baker`, `chimborazo`, `cotopaxi`, `dhaulagiri`, `fuji`, `island-peak`, `kangchenjunga`, `khan-tengri`, `kosciuszko`, `lenin-peak`, `lobuche-east`, `makalu`, `manaslu`, `mount-kenya`, `rainier`, `speke`, `stanley`. Only **six** resolve: `annapurna`, `everest`, `kilimanjaro`, `matterhorn`, `mont-blanc`, `toubkal`. (Recounted in the verification pass — an earlier draft said "12 of the 26" while listing 20 ids.)

Verbatim first record, `icefall-app/src/treks/records.ts:16`:
```
  {"id":"tour-du-mont-blanc","name":"Tour du Mont Blanc","regionId":"alps","country":"France / Italy / Switzerland","mountainIds":["mont-blanc"],"durationDays":[10,11],"difficulty":"Strenuous","maxAltitudeM":2665,"season":"Mid-June – mid-September","priceFromEur":null,"style":"Circuit","summary":"A circuit of about 165 km around the Mont Blanc massif through France, Italy and Switzerland, usually walked anti-clockwise from Les Houches and staying in refuges and valley villages. The high point is the Col des Fours, with the Fenetre d'Arpette variant at the same height.","operatorIds":[],"guideIds":[]},
```

**Trek geometry:** a `Trek` carries no coordinates. `icefall-app/src/treks/route.ts:35-54` defines `TrekRoute { osmId, osmName, lengthKm, lat, lon, bounds, confidence, evidence }`, and `icefall-app/src/treks/osmRoutes.ts:17` holds `TREK_ROUTES` — **92 entries** out of 252. `trekRoute()` (`route.ts:57`) returns `undefined` for the other 160.

**"Famous treks"** (`icefall-app/src/treks/famous.ts:39`) is a hand-written id list — `:23-26` states it is "a human's editorial selection … MUST label it as picked, never as ranked, measured or 'top'". No fame/popularity field exists on `Trek`.

---

#### 6.5 Reference peaks — 53,668 records, `public/data/peaks.json`

On-disk shape `PackedPeak` at `icefall-app/src/services/peaks.ts:57-101`: `n` name, `e` elevation m, `a` lat, `o` lon, `w` wikipedia tag, `v` volcano flag, `d` wikidata QID, `x` `name:en`, `c` country. Verbatim first row of `icefall-app/public/data/peaks.json`:

```
{"n": "珠穆朗玛峰 ཇོ་མོ་གླང་མ། सगरमाथा", "e": 8849, "a": 27.9881, "o": 86.9252, "x": "Mount Everest", "w": "zh:珠穆朗玛峰", "d": "Q513", "c": "People's Republic of China"}
```

Decoded to `Peak` (`icefall-app/src/services/peaks.ts:19-53`): `id, name, elevationM, lat, lon, wikipedia?, volcano?, curatedId?, distanceM?, country?, countrySource?, localName?, wikidata?, photo?, photoCredit?`.

**There is no grade, no difficulty, no season, no duration and no skill field on a reference peak.** That is enforced deliberately by `icefall-app/src/services/peakTier.ts` — `tierOf()` at `:76-78` returns `"objective"` only when a curated record exists, and the file's rule at `:34` is "A REFERENCE ENTRY CARRIES NO VERB OF RECOMMENDATION AND NO GRADE."

Auxiliary static data:
- `icefall-app/public/data/peak-facts/{0..15}.json` — **33,181** Wikidata entities keyed by QID; shape `PeakFacts` at `icefall-app/src/services/peakFacts.ts:43-73`: `label, labelFromMul, labelFromSitelink, description, range, country, commons, article, prominence {m,src}, isolation {km,src}, elevationWikidata {m,src}, elevationDisputed, firstAscent {date, party}`. `FactSource = "cited" | "imported" | "none"` (`:32`). **No difficulty, no requirement, no season.**
- `icefall-app/public/data/peak-photos.json` — **7,549** photo rows under the file's `photos` key, keyed by `osm:<lat>,<lon>`, plus a `rejects` map of 32 named-and-refused images (recounted in the verification pass; an earlier draft said 7,553).

---

#### 6.6 OSM trails — 77,141 bundled records

`Trail` type: `icefall-app/src/services/trails.ts:47-114`. Fields: `id, osmId, name, localName?, ref?, network?, lengthKm, lengthBroken?, lat, lon, distanceM?, colour?, operator?, website?, wikipedia?, wikidata?, sacScale?, ascentM?, descentM?, durationH?, description?, from?, to?, via?, roundtrip?, visibility?, symbol?, officialName?, altName?`.

The **bundled** files carry only 8 of those. `fetchCountryIndex` (`icefall-app/src/services/trails.ts:454-470`) decodes each row as `[osmId, name, lat, lon, network, lengthKm, ref, sacScale]`. Verbatim first row of `icefall-app/public/data/trails/r1311341.json`:
```
[20103, "Playa de El Socorro - Pico del Teide", 28.33283, -16.61432, "rwn", 56, "PR-TF 41", "mountain_hiking"]
```
22 country files, 77,141 relations total (`icefall-app/public/data/trails/manifest.json`, 22 `countries` entries summing to 77,141).

`sacScale` is the **only real, human-assigned difficulty grade anywhere in the app's bulk data**. Labels at `icefall-app/src/services/trails.ts:1239-1246`:
```
export const SAC_LABEL: Record<string, string> = {
  hiking: "T1 · Hiking",
  mountain_hiking: "T2 · Mountain hiking",
  demanding_mountain_hiking: "T3 · Demanding mountain hiking",
  alpine_hiking: "T4 · Alpine hiking",
  demanding_alpine_hiking: "T5 · Demanding alpine hiking",
  difficult_alpine_hiking: "T6 · Difficult alpine hiking",
};
```
It is **optional** — OSM carries it on only some relations, and the bundled row stores `null` where absent. `ascentM`, `descentM` and `durationH` exist on the `Trail` type but are **not in the bundled row format**; they are only populated from the live Overpass path (`trails.ts:340-354`). `trailProfile.ts` computes ascent/descent from a live Open-Meteo elevation sample (`icefall-app/src/services/trailProfile.ts:309,344`) and a walking-time estimate (`:444`).

---

#### 6.7 Supabase schema for objectives (present, unused by the phone app)

`icefall-supabase/migrations/20260828100000_crm_foundation.sql:228-239`:
```
create table if not exists public.destinations (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 120),
  range text,
  region text,
  country text,
  elevation_m int check (elevation_m is null or elevation_m between 0 and 9000),
  -- Whether the mountain is offered as marketplace inventory at all.
  listed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
Later extended for treks — `icefall-supabase/migrations/20260831170000_trek_catalogue_columns.sql:25-28,57` adds `difficulty text`, `season text`, `style text`, `summary text`, `max_altitude_of text`. **No skill, prerequisite or experience column on `destinations`.**

`public.products` (`icefall-supabase/migrations/20260828110000_crm_marketplace.sql:122-177`) is the only objective-shaped table with a requirements column: `kind text check (kind in ('expedition','trek'))`, `duration_days_min/max`, `season text`, `difficulty text`, `max_altitude_m int`, and **`requirements text[] not null default '{}'`** at `:149`, alongside `inclusions`, `exclusions`, `itinerary jsonb`, `faqs jsonb`. `difficulty` is a free-text column with no check constraint.

`public.trek_mountains` (`icefall-supabase/migrations/20260829130000_crm_trek_destinations.sql:86-91`) joins a trek destination to a mountain destination.

Athlete-side history in the DB: `public.summit_logs` (`icefall-supabase/migrations/20260902270000_summit_logs.sql:39-85`) — `post_id, author_id, destination_id, peak_name, elevation_m, summited_on, route, conditions`. The table comment at `:93-96` states: `'A climb somebody published. SELF-REPORTED — there is no verified column and no way to earn one, because verification means a recorded track reached the summit and no track has ever reached a server. Every surface must say so.'`

---

#### 6.8 THE QUESTION THAT MATTERS: is there requirements data per objective a coach can compare an athlete against?

**Yes for the 14 curated mountains and the 3 expeditions — but as unstructured free-text prose that nothing machine-compares. And a separate, structured, elevation-derived requirement set exists that IS machine-compared, but it does not read the curated fields at all.** These two things are easy to conflate; they are different data with different provenance.

**(a) Per-objective, human-written, free text — exists, but is display-only.**

`Mountain.technicalRequirements: string[]`, `Mountain.requiredExperience: string`, `Mountain.trainingRequirements: string[]` (`icefall-app/src/types/index.ts:225-227`). Example, Mont Blanc, verbatim from `icefall-app/src/data/mock/mountains.ts:388-399`:

```
    technicalRequirements: [
      "Crampon and ice-axe proficiency on 35–40° snow",
      "Roped glacier travel and crevasse rescue",
      "Sustained movement above 4,000 m",
    ],
    requiredExperience:
      "Prior alpine summits above 3,500 m and confident self-arrest. Not a first mountaineering objective.",
    trainingRequirements: [
      "8–10 h aerobic volume per week for 4+ months",
      "Repeated 1,200 m+ ascent days back to back",
      "Loaded pack carries at 12–15 kg",
    ],
```

Everest, verbatim from `icefall-app/src/data/mock/mountains.ts:20-32`:
```
    technicalRequirements: [
      "Fixed-line ascension and descent at extreme altitude",
      "Supplementary oxygen systems",
      "Ladder crossings through the Khumbu Icefall",
    ],
    requiredExperience:
      "Prior 8,000 m or multiple 7,000 m summits, plus a documented high-altitude record. Undertaken with a professional expedition operator.",
    trainingRequirements: [
      "12+ months structured periodised training",
      "Repeated multi-week altitude exposure",
      "Load carries at 20 kg+ over consecutive days",
    ],
```

Every consumer of these three fields, found by grepping `icefall-app/src/`:
- `icefall-app/src/components/domain/MountainPage.tsx:1272` renders `curated.trainingRequirements`, `:1299` renders `curated.technicalRequirements`, `:1312` renders `curated.requiredExperience`, `:1352` reuses `technicalRequirements` as a kit list (`const kit = curated.technicalRequirements;`). (Line numbers corrected in the verification pass; the first draft cited :1215/:1242/:1255/:1295.)
- `icefall-app/src/screens/explore/OperatorProfile.tsx:180-181` maps `mountain.technicalRequirements` → `demands` and `mountain.requiredExperience` → `experience` for display; `:169-170` does the same with `exp.prerequisites` / `exp.requiredExperience`.
- `icefall-app/src/screens/Expeditions.tsx:1874` renders `exp.requiredExperience`, `:1881` renders `exp.prerequisites`.

That is the complete list. **No coach module reads them.** They are strings rendered into JSX and nothing else.

**(b) Per-elevation-band, structured, machine-comparable — this is what the coach actually uses.**

`assessPeak(elevationM, lat, lon)` (`icefall-app/src/services/peakAssessment.ts:308-331`) returns a `PeakAssessment` (`:15-32`) with `band (1..7)`, `difficulty`, `label`, `shortLabel`, `summary`, **`skills: string[]`**, `equipmentIds`, `technicalKit`, `seasons`, `seasonNote`, `requiresGuide` and optional `acclimatisation`. The band is selected purely by elevation — `const spec = BANDS.find((b) => elevationM < b.max)` at `:309`. `requiresGuide` is `spec.band >= 4` (`:323`), i.e. **elevation ≥ 2,900 m**.

The `skills` lists are hardcoded per band in `BANDS` (`icefall-app/src/services/peakAssessment.ts:34-203`). Verbatim, band 4 (2,900–3,600 m, `:81-111`):
```
    label: "Alpine — snow and glacier",
    skills: [
      "Crampon and ice-axe technique",
      "Self-arrest on steep snow",
      "Roped glacier travel",
      "Crevasse rescue",
    ],
```
and band 7 (above 6,000 m, `:174-202`):
```
    label: "Extreme altitude expedition",
    skills: [
      "Prior 7,000 m or 8,000 m experience",
      "Fixed-line ascent and descent",
      "Supplementary oxygen systems",
      "Full expedition self-sufficiency",
    ],
```

`assessObjectiveReadiness` (`icefall-app/src/coach/mountainReadiness.ts:1140-1161`) takes the objective as **`peak: { name: string; elevationM: number; lat?: number; lon?: number }` and nothing else** — it cannot see `technicalRequirements`, `requiredExperience`, `trainingRequirements`, `prerequisites`, `gradeLabel` or `difficulty`. At `:1169` it calls `assessPeak(peak.elevationM, peak.lat ?? 0, peak.lon)` and then compares:
- **Technical**: `technicalDimension(assessment, evidence, selfReported.technicalSkills)` at `:1177`; body at `:667-761`. It maps `assessment.skills` to `Requirement[]` and marks one `met: true` only if the athlete's self-report string-matches it (`:694`, via `skillClaimed`). `met` is **never `false`** — comment at `:698-700`: "Not having mentioned a competence is not evidence of lacking it". Score is `capped((held / skills.length) * 100, SELF_REPORT_CEILING)` (`:711`). The dimension is skipped entirely below band 3 (`:673`, `applicable = assessment.band >= 3`).
- **Fitness**: compared against `TRAINING_REFERENCE`, a hardcoded per-band table at `icefall-app/src/coach/mountainReadiness.ts:249-257`:
```
const TRAINING_REFERENCE: Record<PeakAssessment["band"], TrainingReference> = {
  1: { dayAscentM: 400, sustainedHours: 3, weeklyAscentM: 400 },
  2: { dayAscentM: 700, sustainedHours: 5, weeklyAscentM: 700 },
  3: { dayAscentM: 1000, sustainedHours: 7, weeklyAscentM: 1000 },
  4: { dayAscentM: 1200, sustainedHours: 8, weeklyAscentM: 1200 },
  5: { dayAscentM: 1400, sustainedHours: 10, weeklyAscentM: 1500 },
  6: { dayAscentM: 1500, sustainedHours: 12, weeklyAscentM: 1800 },
  7: { dayAscentM: 1600, sustainedHours: 12, weeklyAscentM: 2000 },
};
```
  The comment at `:234-236` is explicit: "These are NOT route data. They do not claim how much a peak climbs, how long it takes…"
- **Altitude**: `altitudeDimension(peak.elevationM, …)` at `:1178`, compared against the athlete's best recorded/logged/self-reported altitude (`bestAltitude`, `:1174`).
- **Experience**: `experienceDimension(peak.elevationM, assessment, evidence, summits, selfReported.disciplineExperience)` at `:1179-1185`.

The self-report vocabulary the athlete picks from is a **closed list of 15 strings** at `icefall-app/src/screens/Onboarding.tsx:295-327` (rendered at `:2012`), deliberately constrained to strings that appear in `peakAssessment`'s band skill lists (comment at `:285-294`). Verbatim:
```
const SKILL_GROUPS: { title: string; skills: string[] }[] = [
  {
    title: "Hill and scrambling ground",
    skills: [
      "Navigation in poor visibility",
      "Grade I–II scrambling",
      "Comfort with exposure",
      "Rockfall awareness",
    ],
  },
  {
    title: "Snow, ice and glacier",
    skills: [
      "Crampon and ice-axe technique",
      "Self-arrest on steep snow",
      "Roped glacier travel",
      "Crevasse rescue",
      "Efficient rope work on mixed ground",
      "Reading snow and serac hazard",
    ],
  },
  {
    title: "Altitude and expedition",
    skills: [
      "Staged acclimatisation",
      "Recognising acute mountain sickness",
      "Cold-injury prevention",
      "Fixed-line ascent and descent",
      "Supplementary oxygen systems",
    ],
  },
];
```

**Consequences a redesign must know:**

1. **Objectives of very different curated seriousness collapse into one band, and therefore into one requirement set.** The selector is `BANDS.find((b) => elevationM < b.max)` (`icefall-app/src/services/peakAssessment.ts:309`); the seven `max` values are 1000, 2000, 2900, 3600, 4500, 6000, `Infinity` (`peakAssessment.ts:46, 58, 70, 82, 113, 144, 175`). Sorting the 14 curated mountains through that gives:

   | Band | Curated mountains in it (elevation, curated `difficulty`, `difficultyLabel`) |
   | --- | --- |
   | 3 (<2,900 m) | Triglav 2,864 m · 3 · Via ferrata / scramble |
   | 4 (<3,600 m) | Mount Olympus 2,918 m · 3 · Demanding hike / scramble |
   | 5 (<4,500 m) | **Matterhorn 4,478 m · 5 · Technical alpine**; **Eiger 3,967 m · 5 · Technical alpine**; **Gran Paradiso 4,061 m · 3 · Introductory alpine**; **Toubkal 4,167 m · 2 · High-altitude trek** |
   | 6 (<6,000 m) | **Mont Blanc 4,806 m · 4 · Serious alpine**; **Kilimanjaro 5,895 m · 2 · High-altitude trek** |
   | 7 (≥6,000 m) | Everest 8,849 · 5; K2 8,611 · 5; Annapurna 8,091 · 5; Broad Peak 8,051 · 5; Aconcagua 6,961 · 4; Denali 6,190 · 5 |

   So the Matterhorn (curated 5, "Technical alpine") and Toubkal (curated 2, "High-altitude trek") receive the **identical** `skills` list and the **identical** `TRAINING_REFERENCE` row (band 5: `{dayAscentM: 1400, sustainedHours: 10, weeklyAscentM: 1500}`), and Mont Blanc shares band 6 with Kilimanjaro. The codebase already measured the disagreement: `icefall-app/src/services/peakTier.ts:53-55` states the derived band "agreed with the curated grade on only 6 of the 14 mountains where a real grade exists to check against."

   Note also that `requiresGuide` is `spec.band >= 4` (`peakAssessment.ts:323`), so Mount Olympus (2,918 m → band 4) is marked as requiring a guide by the derived assessment while its own curated record carries `requiresProfessionalSupport: false` (`icefall-app/src/data/mock/mountains.ts:762`).

   ⚠️ **CORRECTION (verification pass).** An earlier draft of this section said Matterhorn and Mont Blanc "both fall in band 5". That is **false**: Mont Blanc at 4,806 m fails `elevationM < 4500` and lands in band 6. The point survives — the derived requirement set ignores the curated grade — but the example above is the one that is true against the code.
2. `mountainReadiness.ts:315-322` passes latitude `0` when deriving a band (`bandForElevation`), and `assessObjectiveReadiness` passes `peak.lat ?? 0` (`:1169`) — fine for the band, but it means an objective with no coordinate silently gets tropical season logic if season were ever read here. Season is not read here (comment `:1165-1168`).
3. There is **no per-route requirement anywhere**. `MountainRoute` has `difficulty` and `gradeLabel`, and `routeDemands()` turns them into ordinal demand levels (`icefall-app/src/routes/model.ts:121-163`), but no code compares a route's demand level to an athlete. `DEMAND_PROFILE_DISCLAIMER` (`icefall-app/src/services/demandProfile.ts:92-93`) and the module header at `:20-24` state outright: "THERE ARE NO ATHLETE FIGURES IN HERE. This module never sees a training history and cannot say whether anyone meets a demand."
4. Treks have **no requirement, skill or prerequisite field at all** — `TrekDifficulty` and `maxAltitudeM` are the nearest things, and 5 treks have a null difficulty and 38 a null max altitude. `assessObjectiveReadiness` takes an `elevationM`, so a trek could in principle be fed its `maxAltitudeM`, but nothing in the code does; the only trek-aware coach module is `icefall-app/src/coach/trekSuggestions.ts` (not audited in this section).
5. `products.requirements text[]` in Supabase is the only structured requirement column in the database, and **the phone app never reads it** (see §6.0).

**Summary answer:** structured, machine-comparable requirements per objective — **derived from elevation only** (`peakAssessment.ts` band skills + `mountainReadiness.ts` `TRAINING_REFERENCE`). Human-authored requirements per objective — **exist for 14 mountains and 3 expeditions as free-text `string[]`/`string`, and are display-only; no code compares them to an athlete**. Per-route or per-trek requirements — **not implemented**.

---

### 7. Proactive behaviour

#### 7.1 The bottom line

**Nothing is pushed to the athlete without them opening the app. There is no push notification code of any kind in this codebase.**

A grep across `icefall-app/src/`, `icefall-app/vite.config.ts`, `icefall-app/package.json` and `icefall-app/index.html` for `pushManager`, `PushSubscription`, `new Notification`, `Notification.requestPermission`, `showNotification`, `periodicSync`, `backgroundSync`, `BackgroundSyncPlugin`, `serviceWorkerRegistration`, `applicationServerKey`, `VAPID`/`vapid` returns **zero matches**.

Corroborating absences:
- `icefall-app/public/manifest.webmanifest` — full contents are `name, short_name, description, start_url, scope, display, orientation, background_color, theme_color, id, icons`. **No `gcm_sender_id`**, no push-related key.
- No APNs/FCM key, certificate, or `.p8`/`.p12` file anywhere in `icefall-app/` or `icefall-supabase/`.
- No realtime subscription either: grepping `icefall-app/src/` for `supabase.channel`, `.channel(`, `removeChannel`, `postgres_changes` returns **zero matches**. The app has no open socket.

The app states this to the user. `icefall-app/src/notifications/social.ts:332-333`, rendered at `icefall-app/src/screens/Notifications.tsx:871`:
```
export const NOTIFICATIONS_NOT_PUSHED =
  "Nothing here was pushed. ICEFALL has no push notifications, so this is read back from the server at the moment you open the screen. It is a summary, not an alert: it cannot wake your phone and it will not reach you on the mountain.";
```

**One correction to that file's own comment.** `icefall-app/src/notifications/social.ts:28-31` claims "there is no push certificate, **no service worker registration** and no Push API call anywhere in `src/`". The no-push half is correct. The "no service worker registration" half is **false**: `icefall-app/vite.config.ts:48-52` runs `VitePWA({ registerType: "autoUpdate", injectRegister: "auto", … })`, which injects a registration in the production build. A service worker *is* registered — it simply has no `push` handler.

#### 7.2 The service worker: caching only, no background work

`icefall-app/vite.config.ts:48-190` configures `vite-plugin-pwa` in **generateSW** mode (no `srcDir`/`filename`, no custom SW source file — there is no `sw.ts`/`sw.js` in `icefall-app/src/` or `icefall-app/public/`). What it contains:

- `globPatterns` precache: JS/CSS/HTML/WOFF2, `data/peaks.json`, icons, manifest (`:57-63`).
- `navigateFallback: "/index.html"` (`:69`).
- Six `runtimeCaching` rules (`:72-190`): bundled images CacheFirst, `/data/peak-facts/` + `/data/peak-photos.json` StaleWhileRevalidate, Supabase `profile-media` CacheFirst, `tiles.openfreemap.org` CacheFirst, `s3.amazonaws.com/elevation-tiles-prod` CacheFirst, `api.open-meteo.com` NetworkFirst, plus Google Fonts.
- `devOptions: { enabled: false }` (`:53`) — production only.

**No `push` event handler, no `sync`/`periodicsync` registration, no Background Sync queue, no `self.registration.showNotification` call.** Workbox `generateSW` emits none of these unless configured, and none is configured.

#### 7.3 Notification settings that control nothing

`icefall-app/src/screens/settings/Sections.tsx:3600-3691` renders a **Notifications** settings page — "What ICEFALL is allowed to interrupt you for." (`:3627`) — with eight toggles plus a master switch:

Training group (`:3639-3663`): "Training reminders" / "The session you planned for today."; "Coach updates" / "When the plan changes or you should ease off."; "Objective" / "Countdown and preparation milestones."; "Mountain conditions" / "Weather that changes your plans."
People & groups (`:3665-3690`): "Connection requests", "Group activity", "Community", "Bookings & guides".

The first four write to `NotificationPrefs` (`icefall-app/src/state/AppState.tsx:728-733`) via `setNotification` (`:1401-1406`), which only mutates local app state. The other four write to `settings.notify*` (`icefall-app/src/settings/store.ts:133-136`, defaults `true` at `:199-202`).

**Grepping `icefall-app/src/` for every consumer of `notifications.training`, `notifications.recovery`, `notifications.goal`, `notifications.conditions`, `setNotification`, `notifyCommunity`, `notifyConnections`, `notifyGroups`, `notifyBookings` returns matches in exactly three files: the settings screen that renders them, `icefall-app/src/settings/store.ts` (declaration + default), and `icefall-app/src/state/AppState.tsx` (declaration + setter + context wiring).** No other module reads any of them. These eight switches are inert — they persist a boolean and nothing consumes it.

#### 7.4 The Notifications screen: pull-only, no polling

`icefall-app/src/notifications/social.ts` is the whole Notifications screen. It reads three tables — `follows`, `post_likes`, `post_comments` — on mount. Its own header (`:18-31`) is accurate about the mechanism. The unread badge in `icefall-app/src/components/layout/AppTopBar.tsx:124-136` is explicitly a snapshot: "The hook reads on mount and never polls … A follow that lands while the app is open therefore does not bump this number until the next start."

`icefall-app/src/screens/Notifications.tsx:47-48` records the decision: "NO LIVE UPDATING. No polling and no realtime socket; a radio kept awake on a phone that may be on a mountain, for something nothing pushes."

A previous device-local derived feed (`notifications/feed.ts` — today's session, unread threads, an objective countdown at 30/60/90/180 days) is described at `icefall-app/src/screens/Notifications.tsx:41-67` as **deleted on 2026-09-06**. The file does not exist: `ls icefall-app/src/notifications/` returns only `social.ts` and `suggestions.ts`.

`icefall-app/src/notifications/suggestions.ts` is "Suggested people" — also a pull-on-open read of `profiles` (`icefall-app/src/notifications/suggestions.ts:397`, `:442`), not a push.

#### 7.5 Scheduled jobs

There is **one** scheduled job in the entire project, and it does not touch the athlete.

`icefall-supabase/migrations/20260903070000_oura_health_hardening.sql:477-481`:
```
  perform cron.schedule(
    'oura-retention-prune',
    '17 3 * * *',
    $job$ select public.oura_prune_expired(5000); $job$
  );
```
It is a GDPR retention sweep, and it is **conditional**: `:460-466` returns early with a NOTICE if `pg_cron` is not installed, and `:485-495` catches `insufficient_privilege` and raises a NOTICE instead. Whether it is actually scheduled on the live project cannot be determined from the repository. It sends nothing to anyone.

No other `cron.schedule`, `pg_cron` or `pg_net`/`net.http_post` call exists in `icefall-supabase/migrations/`.

`icefall-app/vercel.json` is three lines and has **no `crons` key**:
```
{
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
There is no `.github/workflows` directory in `icefall-app/`.

#### 7.6 Supabase edge functions — two, both request/response, neither outbound

`icefall-supabase/supabase/functions/` contains **three** function directories: `strava/`, `watch/` and `health/`.

⚠️ **`health/` did not exist when this section was first written — it was created by another session at 00:32–00:39 on 2026-09-11, during this audit, and was still being written while the verification pass ran** (`index.ts` appeared between two consecutive directory listings). Treat every line number in it as provisional. What can be said as of the last read:

- Files: `index.ts`, `registry.ts`, `types.ts`, `crypto.ts`, `polar.ts`, `whoop.ts`, `withings.ts`, `oura.ts`.
- `Deno.serve` at `health/index.ts:687`, routing `GET providers`, and per-provider `POST begin` / `GET callback` / `POST finalize` / `POST disconnect`, plus `POST|HEAD withings/webhook` and nothing else (`index.ts:687-717`).
- **It cannot run.** Its queries name `health_connections`, `health_oauth_states`, `health_pending_links` and `health_webhook_events`, and it calls `rpc("health_sweep_states")`. A grep of all 69 files in `icefall-supabase/migrations/` finds **none of those four tables and none of that function**. There is no migration for this feature.
- Nothing in `icefall-app/src` references it: no `HEALTH_PROVIDERS`, no `/health/providers` call. `icefall-app/src/health/` contains only `consent.ts`. The comments in `health/polar.ts` and `health/types.ts` point at `icefall-app/src/health/PolarCredit.tsx` and `icefall-app/src/health/types.ts` — **neither file exists**.
- Oura is present as a descriptor whose every method throws, gated `legal-hold` (`health/oura.ts:90`, `OURA_LEGAL_HOLD_CLEARED`), on two unresolved clauses in Oura's developer agreement. One of them is directly relevant to a coaching redesign, and is stated in that file: Oura data "may NEVER be used to train or improve any AI model", and the file records that "Nothing in the code stops that today except the Coach having no model, which is not a control."

Neither `strava/` nor `watch/` sends anything outbound; both are request/response OAuth/sync endpoints called by the app.

- `strava/index.ts` — routes at `:617-628`: `POST begin`, `GET callback`, `POST finalize`, `POST upload`, `POST disconnect`. All are called *by the app*.
- `watch/index.ts` — routes at `:548-567`: `GET providers`, and per-provider `POST begin`, `GET callback`, `POST finalize`, `POST activities`, `POST disconnect`. The comment at `:567-568` is explicit: "`/watch/<provider>/webhook` is deliberately unhandled — falls through to 404, exactly as an unbuilt route should."

**No Supabase edge function receives an Oura webhook**, despite `public.oura_webhook_events` existing (`icefall-supabase/migrations/20260903060000_oura_health.sql`). The new `health/index.ts` handles a webhook route for **Withings only** (`index.ts:708-711`); the comment beside it says the other three "have no webhook route because none is built for them". The Oura webhook receiver that does exist is in the *web* project, not in Supabase: `icefall-web/api/oura/webhook.js`. (Corrected in the verification pass — an earlier draft said a grep for `oura` under `functions/` returned nothing, which was true before `health/oura.ts` was added mid-audit.)

No function anywhere sends an email, an SMS, a push, or a message. The only email template in the project is `icefall-supabase/templates/confirmation.html` — a Supabase Auth sign-up confirmation, triggered by the user's own registration.

#### 7.7 The one thing the app initiates unprompted — and its limits

`icefall-app/src/coach/liveCues.ts` + `icefall-app/src/coach/useLiveCoach.ts` is the only place ICEFALL speaks first. It emits spoken coaching cues **during an in-progress recording**, via the browser's local `speechSynthesis` (`useLiveCoach.ts:40-55`):
```
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
```
Gated on `enabled && snapshot.status === "recording"` (`useLiveCoach.ts:58`). It uses no AI and no network (`liveCues.ts:7-15`), and compares the athlete only to their own within-session baseline (`:17-24`). This requires the app to be open and actively recording; `icefall-app/src/tracking/useRecorder.ts:239-246` takes a **screen** wake lock, not a background execution permit. It cannot reach an athlete who has not started a session.

Music ducking is called out as impossible on the web at `useLiveCoach.ts:14-19`.

#### 7.8 Timers in the app (all foreground, none proactive)

Every `setInterval` in `icefall-app/src/`:
- `icefall-app/src/components/domain/ObjectiveWeather.tsx:186` — re-render tick for a relative timestamp.
- `icefall-app/src/components/domain/TrailImage.tsx:291` — viewport-proximity poll for lazy image loading.
- `icefall-app/src/tracking/recorder.ts:680` — the 1 Hz recorder ticker.
- `icefall-app/src/tracking/sources/simulator.ts:41` — the position simulator.
- `icefall-app/src/tracking/tracking.test.ts` — test fakes.

None of these schedules a message, a reminder, or any outbound communication.

#### 7.9 Summary table

| Mechanism | Status | Evidence |
| --- | --- | --- |
| Web Push (Push API / PushSubscription) | **not implemented** | zero grep matches across `icefall-app/src/`, `vite.config.ts`, `package.json`, `index.html` |
| Push certificate / VAPID key / FCM sender id | **not present** | no `vapid`/`applicationServerKey` match; `icefall-app/public/manifest.webmanifest` has no `gcm_sender_id` |
| Local `Notification` / `showNotification` | **not implemented** | zero grep matches |
| Service worker | **registered, cache-only** | `icefall-app/vite.config.ts:48-190`; generateSW, no `push`/`sync` handler, no custom SW file exists |
| Background Sync / Periodic Background Sync | **not implemented** | no `backgroundSync`, `BackgroundSyncPlugin` or `periodicSync` match |
| Supabase Realtime subscription | **not implemented** | no `.channel(` / `postgres_changes` match |
| Polling of notifications | **not implemented, deliberately** | `icefall-app/src/screens/Notifications.tsx:47-48`; `icefall-app/src/components/layout/AppTopBar.tsx:124-131` |
| Scheduled job (pg_cron) | **one, conditional, data-retention only** | `icefall-supabase/migrations/20260903070000_oura_health_hardening.sql:477-481`, guarded at `:460-466` and `:485-495` |
| Vercel cron | **not configured** | `icefall-app/vercel.json` (no `crons` key) |
| Edge functions | **two, both inbound OAuth/sync only** | `icefall-supabase/supabase/functions/strava/index.ts:617-628`; `.../watch/index.ts:548-567` |
| Outbound email/SMS from the platform | **not implemented** | only template is `icefall-supabase/templates/confirmation.html` (Auth sign-up) |
| Notification preference toggles | **present in Settings, read by nothing** | `icefall-app/src/screens/settings/Sections.tsx:3600-3691`; consumers only in `store.ts` + `AppState.tsx` declarations |
| Coach speaks unprompted | **only while a recording is running, on-device TTS** | `icefall-app/src/coach/useLiveCoach.ts:40-58` |

---

### 8. Paywall

All paths below are relative to `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-app` unless written out in full.

#### 8.1 The tier table — what is declared

`src/growth/tiers.ts` is the single source. It declares **two** tiers only (`src/growth/tiers.ts:28`):

```
export type TierId = "free" | "pro";
```

`PLANS` (`src/growth/tiers.ts:60-78`):

| `id` | `name` | `tagline` (verbatim) | `monthlyEur` | `annualEur` | `annualMonthlyEquivalent` | `annualSavingPct` | `recommended` |
|---|---|---|---|---|---|---|---|
| `free` | `Base` | `For getting started.` | `0` | `null` | `null` | `null` | — |
| `pro` | `Pro` | `Everything ICEFALL does.` | `9.99` | `null` | `null` | `null` | `true` |

`derive(null, null)` and `derive(9.99, null)` both hit the early return at `src/growth/tiers.ts:50-52`, so both derived fields are `null` on both plans. There is **no annual price in code** — an annual option is not implemented.

Other declared constants:

* `TRIAL_DAYS = 14` (`src/growth/tiers.ts:44`)
* `FREE_COACH_INTERACTIONS_PER_MONTH = 3` (`src/growth/tiers.ts:47`)
* `BILLING_NOTICE` (`src/growth/tiers.ts:367-368`), verbatim:
  > `Billing is not connected yet. No payment method is taken, nothing is charged, and the prices here are what each plan will cost when subscriptions go live.`
* `fmtEur` (`src/growth/tiers.ts:370-372`) — `€0` for zero, otherwise `€` + `toFixed(2)` with a trailing `.00` stripped. `fmtEur(9.99)` → `€9.99`.

**No payment processor exists in this repo.** There is no Stripe/RevenueCat/App-Store client, no checkout, no card form. `grep -rni "stripe|openai|anthropic"` over `src` returns only the model-name strings in `src/coach/budget.ts` (see §9). The Supabase schema at `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-supabase/migrations` contains **no subscriptions, billing, entitlement or coach table** — the only `subscription` hits are an unrelated CRM revenue-stream enum value (`migrations/20260828120000_crm_commercial.sql:383`) and Oura webhook-subscription prose (`migrations/20260903060000_oura_health.sql:368`). Edge functions present: `strava`, `watch` only (`/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-supabase/supabase/functions`).

Subscription state is **local-device only**: `Subscription` (`src/state/AppState.tsx:679-692`) is persisted inside the single `localStorage` record `"icefall.state.v1"` (`src/state/AppState.tsx:33`, written at `:966`). `status: "active"` is declared in the type but **nothing in the codebase ever sets it** — `startTrial` (`src/state/AppState.tsx:1272-1295`) is the only writer of `subscription` and it writes `status: "trialing", tier: "pro"`. Confirmed by grep: no other assignment to `subscription:` exists.

#### 8.2 Every feature id, with declared tier and actual enforcement

`FEATURES` is `src/growth/tiers.ts:124-342`. Three declared states are distinguished by the file itself: normal, `comingSoon` (does not exist), `notYetEnforced` (built, intended to be paid, **no gate written**).

Columns below: **Declared tiers** = the `tiers` array; **`hasFeature("free", id)`** = what the gate function actually returns for a free athlete; **Enforced?** = whether any executable code path reads this id.

| # | Feature id | Label (verbatim) | Group | Declared tiers | Flag | `hasFeature("free")` | Enforced? (call site) |
|---|---|---|---|---|---|---|---|
| 1 | `objective.one` | `One mountain objective` | Your objective | free, pro | — | `true` | **No** — id never read |
| 2 | `objective.readiness` | `Mountain Readiness score` | Your objective | free, pro | — | `true` | **No** — display only, `Pricing.tsx:248` |
| 3 | `objective.profile` | `Performance profile` | Your objective | free, pro | — | `true` | **No** |
| 4 | `objective.countdown` | `Summit countdown` | Your objective | free, pro | — | `true` | **No** |
| 5 | `objective.multiple` | `Multiple objectives` | Your objective | pro | `notYetEnforced` | `true` (via `tiers.ts:356`) | **No** |
| 6 | `training.preview` | `7-day training preview` | Training | free, pro | — | `true` | **No** |
| 7 | `training.full` | `Full personalised plan` | Training | pro | `notYetEnforced` | `true` | **No** |
| 8 | `training.adaptive` | `Adaptive schedule` | Training | pro | `notYetEnforced` | `true` | **No** |
| 9 | `training.session` | `Full session detail` | Training | pro | `notYetEnforced` | `true` | **No** |
| 10 | `coach.limited` | `Coach — 3 conversations a month` (template at `tiers.ts:194`) | Coach | free | — | `true` | **No** — id never read; the *limit itself* is enforced elsewhere, see §8.4 |
| 11 | `coach.unlimited` | `Coach — unlimited` | Coach | pro | — | **`false`** | **YES** — declared at `src/growth/tiers.ts:198` with `tiers: ["pro"]` and **no flag** (re-read in the verification pass); enforced at `src/state/AppState.tsx:1322`, `:1330`; `src/screens/CoachChat.tsx:313`; `src/screens/coach/CoachHub.tsx:474` |
| 12 | `coach.adapt` | `Session adjustments` | Coach | pro | `notYetEnforced` | `true` | **No** |
| 13 | `data.tracking` | `Activity tracking` | Data | free, pro | — | `true` | **No** |
| 14 | `data.progress` | `Progress tracking` | Data | free, pro | — | `true` | **No** — display only, `Pricing.tsx:249` |
| 15 | `data.analytics` | `Advanced analytics` | Data | pro | — | **`false`** | **YES** — `src/screens/mountain/Benchmark.tsx:346, 414, 451, 500, 915, 927`; `src/screens/ActivitySummary.tsx:290` |
| 16 | `data.recovery` | `Recovery analysis` | Data | pro | `notYetEnforced` | `true` | **No** |
| 17 | `conditions.current` | `Current mountain conditions` | Conditions | free, pro | — | `true` | **No** |
| 18 | `conditions.detail` | `Elevation breakdown and extended forecast` | Conditions | pro | — | **`false`** | **YES** — `src/screens/mountain/Conditions.tsx:78` (`const PRO_FEATURE = "conditions.detail";`), `:477` (`const pro = can(PRO_FEATURE);`), `:508`, `:793`, `:986`. Note it is gated through a **constant**, so a grep for `can("conditions.detail")` finds nothing — this was re-verified by reading the file |
| 19 | `fuel.basic` | `Basic nutrition guidance` | Fuelling | free, pro | — | `true` | **No** |
| 20 | `fuel.full` | `Training-day fuelling` | Fuelling | pro | `notYetEnforced` | `true` | **No** |
| 21 | `equipment.checklist` | `Equipment checklist` | Equipment | free, pro | — | `true` | **No** |
| 22 | `equipment.checklist.full` | `Full mountain-specific kit list` | Equipment | pro | — | **`false`** | **YES** — `src/screens/mountain/Checklist.tsx:110, 338` |
| 23 | `equipment.pack` | `Pack weight planner` | Equipment | pro | — | **`false`** | **YES** — `src/screens/mountain/Checklist.tsx:154, 191, 237, 386` |
| 24 | `equipment.documents` | `Permits, insurance and documents` | Equipment | pro | — | **`false`** | **YES** — `src/screens/mountain/Checklist.tsx:111` |
| 25 | `exp.planning` | `Expedition planning` | Expedition | pro | `comingSoon` | `false` | N/A — `useLocked` returns `false` for `comingSoon` (`UpgradePrompt.tsx:81`), so it can never lock |
| 26 | `exp.acclimatisation` | `Acclimatisation planning` | Expedition | pro | `comingSoon` | `false` | N/A |
| 27 | `exp.weather` | `Weather integration` | Expedition | pro | `comingSoon` | `false` | N/A |
| 28 | `exp.route` | `Route and GPX analysis` | Expedition | pro | `comingSoon` | `false` | N/A |
| 29 | `exp.mode` | `Expedition mode` | Expedition | pro | `comingSoon` | `false` | N/A |

**Verified consistency claim (this one is true, and was independently re-verified).** Recounted from the source: `FEATURES` (`src/growth/tiers.ts:124-342`) holds **29** entries; **5** carry `comingSoon` (`exp.planning`, `exp.acclimatisation`, `exp.weather`, `exp.route`, `exp.mode`); **7** carry `notYetEnforced` (`objective.multiple`, `training.full`, `training.adaptive`, `training.session`, `coach.adapt`, `data.recovery`, `fuel.full`). The set {pro-only, not `comingSoon`, not `notYetEnforced`} is therefore exactly `{coach.unlimited, data.analytics, conditions.detail, equipment.checklist.full, equipment.pack, equipment.documents}` — six ids — and all six have a real gate. Every pro-only id that has *no* gate carries `notYetEnforced: true`. **The flags in `tiers.ts` match the code.** (Six of twenty-nine features are actually withheld from a free athlete.)

#### 8.3 Where gating is enforced — the function that refuses

There are **three independent gating mechanisms** in the app. Only the first goes through `tiers.ts`.

**(a) `hasFeature` → `can` → `useLocked`.**

* The refusal function is `hasFeature(tier, id)` at `src/growth/tiers.ts:350-358`:
  * unknown id or `comingSoon` → `false`
  * `notYetEnforced` → `true` **regardless of tier** (`:356`)
  * otherwise `feature.tiers.includes(tier)`
* `currentTier` (`src/state/AppState.tsx:1303-1306`): `"pro"` while `subscription.status === "trialing"`, else `subscription.tier`. Since nothing ever sets `status: "active"`, a non-trialing athlete is always `free`.
* Expiry is derived on read, not by timer (`src/state/AppState.tsx:1255-1263`): a lapsed trial returns `{ status: "expired", tier: "free" }`.
* `can` (`src/state/AppState.tsx:1308`) = `hasFeature(currentTier, id)`.
* `useLocked(featureId)` (`src/components/growth/UpgradePrompt.tsx:67-84`) is the UI-level refuser. It **fails open twice**: unknown id → `false` (`:72-79`, with a DEV-only `console.warn`), `comingSoon` → `false` (`:81`). Otherwise `!can(featureId)`.
* Two renderers consume it: `UpgradePrompt` (`:102-139`) returns `null` when unlocked; `LockedPreview` (`:163-218`) returns `children` untouched when unlocked, and when locked renders the children blurred (`opacity-70 blur-[3px] saturate-[0.85]`), `aria-hidden`, `inert`, under a scrim with the upgrade copy.

**(b) Badge/verification gate — does NOT use `tiers.ts` features.** `src/badges/model.ts:153`:
```
if (badge.proOnly && tier === "free") return { kind: "locked-pro" };
```
Only the `verified` badge sets `proOnly: true` (`src/badges/model.ts:48-57`). Label `"Pro only"` (`:162`). Consumed at `src/screens/settings/Badges.tsx:48`, `src/screens/Profile.tsx:399, 405, 1032`, `src/screens/settings/Sections.tsx:2420`, `src/profile/useProfileCard.ts:70`. Separately, the verification **apply button is disabled** for free at `src/screens/settings/Sections.tsx:2644` with label `Pro members only` (`:2647`), plus a free-tier note at `:2655-2667`.

**(c) Promoted-content gate — also outside `tiers.ts` features.** `src/social/promoted.ts:1174`:
```
if (audience.tier !== "free") return fail("withheld", PROMOTED_SUBSCRIBER);
```
`audience.tier` is `currentTier` from AppState (`src/social/promoted.ts:1506`). The file's own constant at `:316` states verbatim:
> `"Subscribers see no promotions" is enforced by this app, not by ICEFALL's server: billing state is not in the database, so there is no policy that could refuse the row. Today it rests on a tier held in this phone's own storage, for a subscription nobody has ever been charged for.`

**All three gates are client-side and read `localStorage`.** There is no server-side entitlement check anywhere in this repo.

#### 8.4 ONBOARDING — free vs paid

**Nothing in onboarding is gated.** There is no feature id beginning `onboarding.`, and `src/screens/Onboarding.tsx` (3,054 lines) contains **no** call to `can(`, no `UpgradePrompt`, no `LockedPreview`, no read of `subscription` or `currentTier`. Re-verified in the verification pass: a repo-wide grep for `can("` returns hits in only two files (`Benchmark.tsx`, `Checklist.tsx`) plus `Conditions.tsx` via its `PRO_FEATURE` constant, and a grep for `featureId="` returns hits in only five files — `Onboarding.tsx` is in neither list. Its only AppState reads are `account, completeOnboarding, updateCoachProfile, addGoal, setBodyMassKg` (`src/screens/Onboarding.tsx:924`).

The paywall sits **after** onboarding, as a linear sign-up step, not a gate:

1. `src/screens/Onboarding.tsx:2551` — final button navigates to `/connect`.
2. `src/screens/auth/Connect.tsx:336` — `const NEXT = "/trial";`, used by `leave` at `:470` (`navigate(NEXT, { replace: true })`).
3. `/trial` → `TrialStart` (`src/App.tsx:412`, component `src/screens/auth/Trial.tsx:93-171`). Its CTA `Start my 14 days trial` (`:158`) navigates to `/subscribe`; secondary `View all plans` (`:165`) goes to `/pricing`.
4. `/subscribe` → `Paywall` (`src/App.tsx:413`, component `src/screens/auth/Trial.tsx:184-321`). `begin()` (`:193-196`) calls `startTrial()` then `navigate("/home", { replace: true })`. There is no skip-blocking: `Back to ICEFALL` at `:310-316` also goes to `/home`.

So an athlete reaching `/home` without tapping "Start trial" is on `free` with `subscription.status === "none"`, and the free tier still includes every onboarding-derived surface (objective, readiness score, performance profile, countdown, 7-day training preview, activity tracking, progress, basic nutrition, current conditions, equipment checklist).

**Also shown once per install, not part of onboarding proper:** `SubscribeSheet` on Home (`src/screens/Home.tsx:157, 913`), gated by `useSubscribeSheet` reading `localStorage["icefall.subscribe.seen.v1"]` (`src/components/growth/SubscribeSheet.tsx:72, 87-110`).

#### 8.5 COACH — free vs paid, and what the athlete sees when refused

**Free (`coach.limited`, declared):** `Coach — 3 conversations a month`.
**Paid (`coach.unlimited`, enforced):** `Coach — unlimited`.
**Declared paid but ungated (`coach.adapt`, `notYetEnforced`):** `Session adjustments` / `Shorten, swap equipment, or ease off when you're tired.` — nothing checks it.

The Coach hub's other screens are **not gated at all**: `src/screens/coach/` contains `CheckIn.tsx, CoachPlan.tsx, CoachProgress.tsx, Fuel.tsx, Plan.tsx, Progress.tsx, ReadinessScreen.tsx, RecoveryScreen.tsx, SessionDetail.tsx, Today.tsx` and a grep for `can(`/`UpgradePrompt`/`LockedPreview`/`currentTier` over that directory returns hits only in `CoachHub.tsx`.

**How the monthly cap is computed** (`src/state/AppState.tsx`):

* `coachUsage` (`:1315-1319`) — `{ month, count }` keyed by a **local** `YYYY-MM` (`monthKey`, `:724-726`); a stored key from a past month reads as zero without a write.
* `coachInteractionsLeft` (`:1321-1324`):
  ```
  if (hasFeature(currentTier, "coach.unlimited")) return null;
  return Math.max(0, FREE_COACH_INTERACTIONS_PER_MONTH - coachUsage.count);
  ```
* `recordCoachInteraction` (`:1326-1336`) — returns immediately on an unlimited tier, otherwise `count + 1`.

**The refusal in the chat** (`src/screens/CoachChat.tsx`):

* `atLimit = coachInteractionsLeft !== null && coachInteractionsLeft <= 0` (`:35`).
* `send()` hard-refuses: `if (!q || thinking || atLimit) return;` (`:128`). `recordCoachInteraction()` runs **before** the answer is produced (`:132`), so the third question still gets an answer.
* Inbound questions from the hub do not fire at the limit (`:115`).
* At the limit the **suggested-prompt row is not rendered** (`:285`, `{!atLimit && (`) and the **composer is replaced** by `<UpgradePrompt featureId="coach.unlimited" .../>` (`:305-317`, the `featureId` at `:313`).

*(Line numbers in `src/screens/CoachChat.tsx` corrected in the verification pass. That file is being edited live by another session — it grew from 415 to 444 lines during the pass — so search for the identifier rather than trusting the number. Nothing observed in those edits changes the metering.)*

What the athlete literally sees when refused, in the chat:

* A lock glyph, then title (`src/growth/upgradeCopy.ts:43`), verbatim:
  > `That's your free Coach conversations for this month.`
* Body (`src/growth/upgradeCopy.ts:44-46`) — with a dated objective ahead of them:
  > `Unlimited Coach with ICEFALL Pro — every day of preparation, right up to ${ahead.mountain}, ${ahead.when}.`
  where `when` is `"tomorrow"` for 1 day, else `"${days} days away"` (`:30`). Without a dated future objective:
  > `Unlimited Coach with ICEFALL Pro — ask as often as you train.`
* CTA link to `/pricing`, label (`src/components/growth/UpgradePrompt.tsx:42`): `Unlock my plan`
* Below it (`src/components/growth/UpgradePrompt.tsx:51`), verbatim:
  > `Billing is not connected yet — nothing is charged.`

What they see on the Coach hub (`src/screens/coach/CoachHub.tsx:463-477`) — the whole ask bar and its chips are replaced by:

* Eyebrow `Ask your coach`
* > `You have used this month's free coach conversations.`
* the same `UpgradePrompt` block.
* `ask()` also refuses at the limit before navigating (`:437`).

Below the limit, the composer carries two counters (`src/screens/CoachChat.tsx:326-347`, duplicated verbatim at `src/screens/coach/CoachHub.tsx:531-548`):

* left: `{n} free conversation(s) left this month`
* right: `{n} coach credit(s) today`, or when `isExhausted` → `Saved guidance · more tomorrow`
* and a privacy line (`CoachChat.tsx:323-325`): `Coach conversations are private · Not shared to Social`

**Not a refusal:** `budgetSpent` / `isExhausted` never disables anything. `CoachChat.tsx` computes it at `:34` and uses it only to swap the counter text at `:339-346`. See §9.5 for why it can never be true in this build anyway.

#### 8.6 Refusals on the other five enforced features

* **`data.analytics`** — `src/screens/mountain/Benchmark.tsx`: four `LockedPreview` blurs (`:320-369` readiness-against-target rows, `:388-402` mountain demand profile, `:425-439` gap tiles, `:474-486` objective comparison) each with its own title/body, e.g. `Readiness against target is part of ICEFALL Pro.` (`:322`), `The mountain demand profile is part of ICEFALL Pro.` (`:391`), `Gap analysis is part of ICEFALL Pro.` (`:428`), `Comparing objectives is part of ICEFALL Pro.` (`:477`). Plus a trend chart replaced by prose + `UpgradePrompt` at `:850-862`; the substituted sentence is generated at `:851-854` and includes `The trend chart is part of ICEFALL Pro; the readings accrue whichever plan you are on.` The recommendation sentence beside the gap is deliberately left free (`:421-423` comment + `:423` JSX).
  `src/screens/ActivitySummary.tsx:290` shows the analytics prompt after a recorded activity, copy from `useUpgradeCopy("analytics")` (`src/growth/upgradeCopy.ts:34-40`): title `See what this session did to your training load.` — re-read verbatim in the verification pass.

  *(The `Benchmark.tsx` line numbers in the paragraph above are ~25 lines low. Re-greped: the five `featureId="data.analytics"` sites are `:346`, `:414`, `:451`, `:500`, `:927`, and the `can("data.analytics")` read is `:915`. The blur titles and the substituted sentence are unchanged — only the addresses moved.)*
* **`conditions.detail`** — the id lives in a constant, `const PRO_FEATURE = "conditions.detail";` (`src/screens/mountain/Conditions.tsx:78`), so a grep for `can("conditions.detail")` finds nothing; the gate is `const pro = can(PRO_FEATURE);` (`:477`), passed as `includeBands: pro` into `getMountainConditions` (`:508`), so the free tier **does not even fetch** the per-band forecasts. The free athlete gets a `Card` stating how many elevation bands exist, then an `UpgradePrompt` (`:793`) with title `The elevation breakdown is part of ICEFALL Pro.` Extended-forecast panels are replaced by `LockedPanel` (`:982-988`, rendered at `:1046` and `:1063`).
* **`equipment.checklist.full` / `equipment.documents`** — `src/screens/mountain/Checklist.tsx:110-111` reads `const fullList = can("equipment.checklist.full");` and `const canDocuments = can("equipment.documents");`, and the generated items are filtered on them: an item the athlete has already recorded a status against is **always** shown; `documents` items require `canDocuments`; everything else requires `fullList || item.essential`. The prompts render at `:338` (`featureId="equipment.checklist.full"`) and `:386`.
* **`equipment.pack`** — `packGranted = can("equipment.pack") || pack.length > 0`, written twice (`src/screens/mountain/Checklist.tsx:154` and `:237`) — once the athlete has weighed anything the gate opens permanently. Prompts at `:191` and `:386`.

#### 8.7 Pricing screen — what it renders

`src/screens/growth/Pricing.tsx`, route `/pricing` (`src/App.tsx:417`), reachable from every `UpgradePrompt` (`UpgradePrompt.tsx:128, 212`), Settings (`Sections.tsx:2662, 3527`), Badges (`Badges.tsx:69, 167`), Search (`Search.tsx:228-233`) and `SubscribeSheet` (`:230`).

* Two `PlanColumn` cards are rendered inside `grid grid-cols-3` (`:648`) — a three-column grid holding two plans.
* Card checklist `CARD_LINES` (`:247-256`) resolves through `hasFeature` (`:304`): `Readiness score`, `Progress tracking`, `Unlimited Coach`, `Advanced analytics`, `Extended forecast`, `Full kit list`, `Pack planner`, `Permits & docs`.
* `MOST POPULAR` badge on `pro` (`:284`).
* Pro card also prints `+ 5 more, coming soon` (`:323-327`, `soon.length` = the five `exp.*` rows).
* A `PeriodSwitch` with `Monthly` / `Yearly` buttons (`:192-224`). Because both plans have `annualEur === null`, `MAX_ANNUAL_SAVING` is `0` (`:156`) so no saving badge renders, `priceCopy` falls through to the monthly branch (`:152`), and selecting `Yearly` changes only the `Billing period` row in the terms table (`:735`) to `Annual`. **The yearly option changes no price.**
* `Restore` button (`:613-619`) sets local state and prints, verbatim (`:633`):
  > `Nothing to restore — billing isn't connected yet, so no purchase has ever been made.`
* Disclosure above the cards (`:636-639`), verbatim:
  > `14 days free, then the price shown. Nothing is charged — billing isn't connected. Prices are what each plan will cost when subscriptions go live.`
* `Compare all features` collapsible (`:692-717`) with caption (`:708-713`), verbatim:
  > `A tick means the feature works in ICEFALL today. A ticked asterisk means it is built and every plan can use it right now, planned to become paid once billing is connected — nothing is withheld today. Anything marked coming soon is not built and is not included at any price.`
* `ComparisonTable` `Cell` (`:447-495`) renders three distinct marks: a hollow `Circle` with tooltip `Coming soon — not included` (`:451-457`); a `Check` + `*` with tooltip `Available to everyone while billing is not connected. Planned as a paid feature.` for `notYetEnforced` rows (`:463-477`); a plain `Check` (`:480-487`) or a `Minus` (`:489-493`).
* Terms rows (`:731-738`): `Free trial` / `14 days, free`; `Plan the trial opens` / `Pro`; `Pro after the trial` / `€9.99 per month`; `Billing period`; `Cancel` / `Any time`; `Payment method` / `None taken`.

#### 8.8 SubscribeSheet — the one modal, and what it actually lists

`src/components/growth/SubscribeSheet.tsx`. Shown once per install on Home. Derived lists:

* `INCLUDED` (`:59-61`) = first 4 of {non-comingSoon, pro-only} = **`objective.multiple`, `training.full`, `training.adaptive`, `training.session`** — i.e. `Multiple objectives`, `Full personalised plan`, `Adaptive schedule`, `Full session detail`. **All four are `notYetEnforced`**: every one of them is available to free athletes today, and none is the reason to pay. The four genuinely-withheld pro features (`Coach — unlimited`, `Advanced analytics`, `Elevation breakdown and extended forecast`, `Full mountain-specific kit list`) appear in neither list on this sheet.
* `NOT_IN_FREE` (`:63-69`) = same filter minus `notYetEnforced`, `.slice(4, 7)`. That filtered array has exactly six entries (`coach.unlimited`, `data.analytics`, `conditions.detail`, `equipment.checklist.full`, `equipment.pack`, `equipment.documents`), so the slice yields **two**: `Pack weight planner` and `Permits, insurance and documents`, under the divider `Not on Base` (`:203`).
* CTA `Start 14-day free trial` → `/trial` (`:176-178`); sub-line (`:181-184`): `No card needed — ICEFALL has no payment processor connected yet, so nothing is charged. €9.99 is what Pro will cost when subscriptions go live.`
* Dismiss controls: scrim (`:119-124`), `Not now` (`:222-228`), `×` (`:239-246`); `Compare plans` → `/pricing` (`:229-235`).

#### 8.9 Dead / unwired paywall code

* `TrialBanner` (`src/components/domain/TrialBanner.tsx`) is **never imported or rendered** anywhere in `src` (grep for `TrialBanner` outside its own file returns nothing).
* `Plan.annualEur`, `annualMonthlyEquivalent`, `annualSavingPct`, `priceCopy`'s annual branch (`Pricing.tsx:126-140`) and `MAX_ANNUAL_SAVING` are all reachable code paths that never fire with the current `PLANS`.
* `Subscription.status === "active"` is never set (see §8.1).
* `FEATURE_GROUPS` and `featuresForGroup` (`tiers.ts:360-364`): `FEATURE_GROUPS` is used by `Pricing.tsx:520`; `featuresForGroup` has **no caller**.

---

### 9. Cost controls

#### 9.1 The headline fact: the production build makes no model call

`src/services/coach.ts:28`:
```
const ENDPOINT = import.meta.env.VITE_COACH_ENDPOINT as string | undefined;
```
The model branch is `if (ENDPOINT && !DEMO) { … }` (`src/services/coach.ts:222-275`). `DEMO` is `OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1"` (`src/offline/offline.ts:34`, `:14`).

`VITE_COACH_ENDPOINT` is **not set** in the repo's only env file. `icefall-app/.env.local` contains exactly two keys — `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (values `[secret — not reproduced]`). The variable name appears elsewhere only as documentation (`README.md:278`), a type declaration (`src/vite-env.d.ts:5`) and the read above.

**Confirmed against the checked-in build artefact.** `icefall-app/dist/assets/coach-8k75RJyC.js` (built 2026-09-04) contains the compiled `askCoach` in full:
```
async function C(e,t,a=[],n=Number.POSITIVE_INFINITY){const o={id:`coach-${Date.now()}`,at:new Date().toISOString()};return a.slice(-6),await new Promise(i=>setTimeout(i,620)),{message:{...o,...j(e,t)},spentMicros:0,scripted:!0}}
```
The whole `if (ENDPOINT && !DEMO)` block — the estimate, the `fetch`, the `maxTokens`, the usage accounting — has been eliminated at build time. `spentMicros` is a hard-coded `0` and `scripted` a hard-coded `true`.

**What that means for cost:** in a build with `VITE_COACH_ENDPOINT` unset, the Coach costs **zero per-token spend**, because no token is ever bought. Every reply comes from the **nine** hand-written regex rules and the fallback in `src/services/coach.ts:70-189`. (Corrected in the verification pass — recounted by literal object braces inside `RULES`: nine, not eight. The one missing from the first draft was the weather/conditions rule at `:167-172`.) Consequently every control listed in §9.2–§9.4 below is **latent**: it exists in source, it is correctly wired to the model branch, and it does not execute. None of it is currently protecting anything.

*(Uncertain: whether `VITE_COACH_ENDPOINT` is set as a Vercel project environment variable. `icefall-app/vercel.json` declares no `env` block and the Vercel dashboard is not readable from here. If it were set in a deploy, the branch would compile in and §9.2–§9.4 would apply — but even then the enforcement is entirely client-side.)*

#### 9.2 Token limits and history

* **Max reply tokens: 700.** `MAX_REPLY_TOKENS = 700` (`src/coach/budget.ts:93`), sent as `maxTokens` in the POST body (`src/services/coach.ts:257`). Enforcement therefore depends on a proxy honouring that field; **no such proxy exists in this repo** (see §9.6), so this is a request, not a guarantee.
* **Max history sent: 6 turns.** `HISTORY_TURNS = 6` (`src/coach/budget.ts:96`); `const recent = history.slice(-HISTORY_TURNS)` (`src/services/coach.ts:218`), mapped to `{role, body}` at `:254`. Note the slice runs *before* the endpoint check but its result is only used inside the branch (in `dist` it survives as the no-op `a.slice(-6)`).
* **No cap on the question itself.** The composer `<input>` (`src/screens/CoachChat.tsx:355-361`) has no `maxLength` — re-read attribute by attribute in the verification pass: `value`, `onChange`, `placeholder`, `aria-label`, `className`, and nothing else. There is no truncation of `q` anywhere in `send()` or `askCoach`.
* **System prompt size is unbounded by any constant.** `systemPromptFor(ctx)` (now `src/coach/context.ts:434-454` — that file was edited mid-audit and is now 454 lines) interpolates `describeAthlete(ctx)` (`:250-286`), `describeState(ctx)` (`:289-381`) and `limitationsBlock(ctx)` (`:405-432`) — none of which is length-capped. `describeState` in particular now emits an extra sentence for an unsurveyed objective. Its fixed frame, verbatim and re-checked character by character (`src/coach/context.ts:435-453`):
  ```
  You are the ICEFALL Coach, inside a mountaineering training app.

  WHO YOU ARE TALKING TO
  ${describeAthlete(ctx)}

  WHAT ICEFALL HAS MEASURED
  ${describeState(ctx)}

  HOW YOU MUST BEHAVE
  - Use the data above. Refer to their real sessions, numbers and objective. Never invent a figure.
  - If something is "not given" or "not computable", say so and ask — do not estimate it.
  - NEVER contradict the prescribed/downgraded session above.
  - You are NOT a doctor. Defer anything medical (pain, injury, illness, altitude sickness,
    medication) to a doctor, and say so explicitly.
  - You are NOT a guide. Defer route choice, glacier travel, avalanche and technical terrain
    judgement to a certified mountain guide. Never clear anyone as "ready" for a summit.
  - Never infer technical skill or altitude experience they did not claim.
  - Be concise and specific — a few short paragraphs, no lists of caveats.
  - British English, plain and direct. No hype.${limitationsBlock(ctx)}
  ```
* **One conditional prompt extension, capped at 5 rows.** `isTrekQuestion(question)` (`src/coach/trekSuggestions.ts:95-97`, regex at `:92-93`) appends `trekContextBlock(...)` to the system prompt (`src/services/coach.ts:229-231`). The block lists at most `MAX_SUGGESTIONS = 5` treks (`src/coach/trekSuggestions.ts:46, 75`). The comment at `src/services/coach.ts:227-228` records this as a deliberate token saving on other questions.

#### 9.3 Pre-flight cost estimate — the only thing that stops a call

`estimateExchangeMicros(systemTokens, historyTokens, model)` (`src/coach/budget.ts:184-196`) prices `systemTokens + historyTokens + 40` input at full (uncached) rate plus a full `MAX_REPLY_TOKENS` output. Token counting is `approxTokens = chars / 4` (`src/coach/budget.ts:199`).

The refusal (`src/services/coach.ts:232-242`):
```
const estimate = estimateExchangeMicros(
  approxTokens(system),
  recent.reduce((n, m) => n + approxTokens(m.body), 0),
);

if (estimate > budgetMicros) {
  await new Promise((r) => setTimeout(r, 320));
  return { message: { ...base, ...scripted(question, ctx) }, spentMicros: 0, scripted: true };
}
```
`budgetMicros` is supplied by the only caller as `remainingMicros(coachBudget)` (`src/screens/CoachChat.tsx:138`). Note the estimate ignores the trek block: `approxTokens(system)` is computed on the *concatenated* string at `:233`, so the block *is* counted — correct.

#### 9.4 The two ceilings, and the cost model

`src/coach/budget.ts`:

| Constant | Value | Line | Period | Visible to athlete? |
|---|---|---|---|---|
| `DAILY_CREDITS` | `8` | `:68` | local day (`currentDay`, `:142-144`) | Yes — `{n} coach credits today` |
| `HARD_CAP_MICROS` | `1_000_000` (= $1.00) | `:84` | local month (`currentPeriod`, `:131-133`) | No |
| `MAX_REPLY_TOKENS` | `700` | `:93` | per reply | No |
| `HISTORY_TURNS` | `6` | `:96` | per request | No |

* `creditsLeft(s) = max(0, 8 - s.creditsUsed)` (`:164`); `remainingMicros(s) = max(0, 1_000_000 - s.spentMicros)` (`:168`); `isExhausted(s) = creditsLeft <= 0 || remainingMicros <= 0` (`:177`).
* `normalise` (`:150-160`) rolls the two clocks independently on read — no timer needed.
* `costOf(usage, model)` (`:106-115`) prices integer micro-dollars from `MODEL_RATES` (`:38-45`).
* **`isExhausted` is not a block.** `CoachChat.tsx:33` and `CoachHub.tsx:392` read it only to swap counter text (`CoachChat.tsx:321-328`, `CoachHub.tsx:540-547`); `CoachHub.tsx:382-385` records this in prose. The actual stop is the §9.3 estimate check, which produces a scripted reply rather than an error.
* Persistence: `coachBudget` lives in the same `localStorage` blob (`src/state/AppState.tsx:500, 1372`). `src/coach/budget.ts:8-20` states in its own header that this is a **display and a client-side courtesy stop, not a limit**, and that the real cap must live in the server-side proxy. That proxy does not exist here (§9.6).

#### 9.5 The credit counter never moves in this build

`creditsUsed` is written in exactly one place — `recordCoachSpend` (`src/state/AppState.tsx:1374-1387`, `creditsUsed: current.creditsUsed + 1` at `:1382`) — and `recordCoachSpend` has exactly one caller, guarded (`src/screens/CoachChat.tsx:144`):
```
if (spentMicros > 0) recordCoachSpend(spentMicros);
```
On the scripted path `spentMicros` is always `0` (`src/services/coach.ts:241, 279`, and hard-coded `0` in `dist`). Therefore, with no endpoint configured: `creditsUsed` stays `0` forever, `creditsLeft` always reads `8`, and `isExhausted` is always `false`. The `8 coach credits today` line on both Coach screens is a **constant** in the shipped build, and the money backstop can never engage.

#### 9.6 Rate limiting, caching, model routing, debouncing — what is and is not there

* **Rate limiting: not implemented server-side.** No coach endpoint, no rate-limit table, no 429 handling beyond the generic `if (!res.ok) throw` → scripted fallback (`src/services/coach.ts:260, 272-274`). `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-supabase/supabase/functions` holds **three** directories — `strava`, `watch` and `health` — and **none is a model proxy**. (`health/` was created by another session at 00:32–00:39 on 2026-09-11, during this audit; it cannot run, because none of the four tables it queries exists in any of the 69 migrations. See section 4 §4.6b.)
* **Client-side concurrency guards (not rate limits):** `send()` refuses while a reply is in flight (`thinking`, `src/screens/CoachChat.tsx:124`); suggested-prompt buttons are `disabled={thinking}` (`:275`); the submit button is `disabled={!draft.trim() || thinking}` (`:346`); an inbound hub question fires once per mount via `firedRef` and clears router state before sending (`:108, 111-114`).
* **Debouncing: none.** Grep for `debounce`/`throttle` across `src/coach`, `src/services/coach.ts`, `src/screens/CoachChat.tsx` and `src/screens/coach` returns nothing.
* **Caching of coach replies: none.** No memo, no store, no keyed cache; the transcript is component-local `useState` (`src/screens/CoachChat.tsx:65`) and is lost on reload (recorded deliberately at `:83-90`).
* **Prompt caching: priced for, never requested.** `Rate.cachedInput` exists at `src/coach/budget.ts:34-36, 40-44` and `costOf` accepts `cachedInputTokens` (`:108`), but the POST body (`src/services/coach.ts:251-258`) sends no cache-control directive of any kind, and `estimateExchangeMicros` deliberately assumes no cache hit (`:184-196`). Any cache saving would have to be implemented by a proxy that does not exist.
* **Model routing: not implemented.** `MODEL_RATES` declares three models (`src/coach/budget.ts:38-45`) but nothing selects between them. Both the request (`src/services/coach.ts:255`) and the billing (`:269`) hard-code `DEFAULT_COACH_MODEL` (`= "claude-haiku-4-5"`, `src/coach/budget.ts:48`), and `askCoach` exposes no model parameter. There is one model and no router.
* **Monthly interaction cap: yes, and it is the one cap that actually bites today.** `FREE_COACH_INTERACTIONS_PER_MONTH = 3` (`src/growth/tiers.ts:47`), enforced at `src/state/AppState.tsx:1321-1336` and refused at `src/screens/CoachChat.tsx:124` / `src/screens/coach/CoachHub.tsx:437`. Because `recordCoachInteraction()` is called before the answer is produced (`CoachChat.tsx:128`) and the scripted path costs nothing, this cap currently limits **scripted** replies rather than spend.
* **A real non-LLM cost control:** `includeBands: pro` (`src/screens/mountain/Conditions.tsx:508`) suppresses one forecast request per elevation band for free athletes — the comment at `:499-500` states each band costs one request. There is no HTTP cache in `src/services/conditions.ts` (grep for `cache`/`TTL` returns nothing).
* **Not a cost control, but it shapes the perceived cost:** the 5.0–9.0 s artificial `Thinking…` floor at `src/screens/CoachChat.tsx:176-180` (`MIN_VISIBLE_MS = 5_000 + Math.floor(Math.random() * 4_000)`), documented at `:142-175` as a deliberate owner decision. It delays display only; it never shortens a real wait and never changes the answer.

---

