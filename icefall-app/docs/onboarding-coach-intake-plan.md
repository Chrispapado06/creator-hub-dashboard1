# Onboarding, medical screening and the first coach session — Step 1 plan

**Status: planning only. No application code, data or migration has been changed.**
Written 11 September 2026, against the code as it stands today.

---

## How to read this

Every factual claim below was checked against the code, not against a comment. Where your brief
assumed something that turned out not to be true, I say so plainly and quote the file and line
that disproves it — you asked for exactly that.

A few words used throughout, in plain English:

| Word | What it means here |
|---|---|
| **Reaches** | An answer *reaches* something if changing it changes something you can see — a session, a plan, a readiness figure, a cost, what the coach says. If changing it changes nothing, it reaches nothing. |
| **The prompt** | The block of text ICEFALL writes and sends to the AI model each time you talk to the coach. It describes you. |
| **Readiness** | The scored assessment of how prepared you are for an objective. |
| **The generator** | `buildPlanForGoal` — the one function that builds your whole training plan. |
| **Migration** | A change to the database structure. These are applied by hand and are risky, so I flag every one. |

---

# 1. Current state

## 1.1 The honest headline: eleven answers reach nothing

This is the finding that justifies the whole job. ICEFALL asks eighteen questions at signup. **At
least eleven stored answers change nothing an athlete can see**, and most of them are not even
honest about it.

| Answer | What it actually does | Verified at |
|---|---|---|
| **Gender** | Nothing. Written to the account and read by no session, plan, figure or screen. | `src/screens/Onboarding.tsx:1077`, `:1163-1166`; grep finds no reader |
| **Where you found ICEFALL** | Nothing inside the app. The only reader is an admin-only database function that no app code calls. | `icefall-supabase/migrations/20260903040000_gender_and_heard_about.sql:782-822` |
| **The seven "declined" flags** | Nothing at all. Assembled, sent to the server, and read by nobody. | `Onboarding.tsx:1053-1064`; `src/state/AppState.tsx:338-347` |
| **`trainingIntent`** | Nothing. Its own comment describes a reader that reads a different field. | `Onboarding.tsx:1147`; `src/settings/store.ts:150` |
| **The limitations free-text note** | Reaches the coach's prompt only. No session changes because of it. | `src/coach/context.ts:951` |
| **Asthma / Heart / Recent surgery** | Reach the prompt only. The session engine cannot act on any of them, and says so. | `src/coach/sessions.ts:1543`, `:1943-1946` |
| **Mountain-biking / Alpine-skiing / "Something else" disciplines** | Filtered out before they reach anything. An athlete who picks only these is recorded as having named no disciplines. | `Onboarding.tsx:1080-1083` |
| **Per-discipline experience level** | Reaches readiness as *unscored context only*. It never moves a number. | `src/coach/mountainReadiness.ts:1106-1123` |

The first two are **honest** — the screens say in plain words that they change nothing. The rest
are not.

**The worst of them is the seven declined flags.** In September you ruled that "asked, and they
said none" must stay distinct from "never asked". That ruling is currently *recorded and then
thrown away*. It is also the exact distinction the medical screening and the new profile summary
both depend on. Fixing it is cheap and is folded into Section 2.

## 1.2 The step list, as it stands

21 possible screens: an intro, up to 18 questions, a "building" reveal, a payoff. Two questions
are conditional, so the live total is **19, 20 or 21**.

| # | Screen | Heading |
|---|---|---|
| 00 | intro | *Let's build your mountain* |
| 01 | Disciplines | What do you actually do? |
| 02 | Experience *(only if a discipline was chosen)* | How far in are you? |
| 03 | Objective | What are you building towards? |
| 04 | Timeline *(only if a peak was picked)* | When do you want to be standing on it? |
| 05 | Training days | Which days are yours? |
| 06 | Session length | How long is a normal session? |
| 07 | Equipment | What can you train with? |
| 08 | Strength work | How much strength training have you done? |
| 09 | Technical skills | What have you been taught? |
| 10 | Altitude | How high have you been? |
| 11 | Altitude illness | Have you had altitude sickness? |
| 12 | Current volume | How much are you training at the moment? |
| 13 | Limitations | Anything ICEFALL should train around? |
| 14 | Gender | How do you describe yourself? |
| 15 | Sex at birth | Sex assigned at birth? |
| 16 | Body numbers | A few numbers about you. |
| 17 | Heard about | Where did you find ICEFALL? |
| 18 | Name | Last one. |
| 19 | building | *(self-advancing, 11.4 seconds)* |
| 20 | payoff | |

Verified at `src/screens/Onboarding.tsx:671-692`, `:702-721`, `:830-881`.

**One structural fact that governs everything below.** The save runs *on leaving the name step*
(`Onboarding.tsx:1519-1523`). Any question placed after it is silently discarded. This is why the
name is last today, and it is the single constraint that has shaped the whole flow.

## 1.3 What each answer that *does* reach something reaches

| Answer | Reaches | Verified at |
|---|---|---|
| Objective + timeline | **Everything.** The entire plan is built backwards from the target date, clamped to 8–52 weeks. | `src/tracking/training.ts:609-618` |
| Training days | The generator lays sessions on exactly those days. | `training.ts:416-425`, `:628-650` |
| Session length | A hard cap on every session *except* the long mountain day. | `training.ts:271`, `:631` |
| Current training volume | How many sessions week 1 carries and how much load, ramping one session every second week. **Without it there is no ramp at all** — week 1 starts at full capacity. | `training.ts:381-414` |
| Equipment | The session engine refuses to prescribe a movement whose kit you do not have. | `src/coach/sessions.ts` (`kitAvailable`) |
| Strength experience | Caps how hard a prescribed movement may be, and how many movements are in the main block. | `sessions.ts:170`, `:185` |
| Technical skills | The technical dimension of readiness, the skill-gaps screen, the debrief, the operator attachment, the prompt. | `mountainReadiness.ts:807-870` |
| Highest altitude | The altitude dimension of readiness, as a floor. | `mountainReadiness.ts` (`bestAltitude`) |
| Altitude illness | The ascent-rate policy — metres of sleeping gain per night, rest nights. Deliberately hidden from operators. | `src/services/acclimatisation.ts:144-178` |
| Knee / back / shoulder / ankle-foot | The session engine modifies the day *before* you open it. | `sessions.ts:1899-1994` |
| Weight | The calorie estimate on every recorded session, Fuel, Today, the plan, the prompt. **The single most-read answer in the flow.** | `Onboarding.tsx:1141` |
| Height + year of birth | Both are terms in the resting-energy equation, and together decide which equation is used. | `src/coach/fuelDay.ts:478-488` |
| Sex at birth | Exactly one thing: the sex term of the resting-energy equation. | `src/coach/fuelDay.ts:428-429` |
| Name | The prompt, the local account, and the server so a second device does not re-ask. | `src/auth/account.ts:372-390` |

## 1.4 Three pieces of on-screen copy that are now wrong

| Copy | Where | The problem |
|---|---|---|
| "About a minute." | `Onboarding.tsx:2608` | Measured: ~1,212 words of on-screen copy across 18 screens. Roughly **5 min 46 s**. Out by about 5.8x. |
| "Every one is answerable… 'prefer not to say' is offered as a real option." | `Onboarding.tsx:2608` | Weight has no decline control and blocks the button. |
| "ICEFALL records these as your own words and never scores them." (experience) | `Onboarding.tsx:1665` | True of readiness. **False** of the Expedition Network, where the derived level becomes a numeric compatibility score (`src/network/matching.ts:433`). |

And two in Settings that matter for the medical work:

> "Everything ICEFALL records stays on this device. Nothing is uploaded." — `Sections.tsx:3363`
>
> "Nothing leaves this device today, so deleting here deletes everything." — `Sections.tsx:3959`

**Both are false.** Your profile — including your declared injuries and altitude-illness history —
is uploaded to the server by `syncOnboarding` (`src/auth/account.ts:329`). And "Delete everything"
deletes *nothing* on the server: it clears this phone and makes no network call
(`src/state/AppState.tsx:1414-1429`). There is no delete grant on the profile table at all, so
even a client that wanted to could not. **This has to be fixed as part of the medical work, because
the medical consent screen cannot honestly promise deletion until a delete path exists.**

---

# 2. Every new field

## 2.1 The good news: Part A needs no database migration

Every new questionnaire answer rides an existing free-form column (`athlete_profiles.answers`).
Adding an *optional* field is free and safe: every existing athlete's record loads unchanged and
reads as "never asked", which is exactly what it is.

Three things that would **not** be free, and which no new field may do:

1. **A new typed database column can lock an athlete out of signup.** If one value fails a
   constraint, the whole save fails, taking the "you are onboarded" flag with it, and that athlete
   is sent back through every question on their next sign-in.
2. **Renaming or restructuring an existing field destroys every existing athlete's answers**, with
   no recovery on the phone. The local store has no migration mechanism at all — it is a blind
   merge over defaults (`src/state/AppState.tsx:616-632`).
3. **Dropping the derived `experience` string locks every existing athlete out of their own
   account.** See 3.2.

## 2.2 The blocker that changes the design — "none" cannot be stored as an empty list

**This was found by attacking the plan and it is the most important correction in this document.**

The original design stored "I have done none of these" as an empty list, and "I have not had a
mountain day this year" as a null. Both are meant to be *real answers*, distinct from silence.

They cannot be. The function that restores your profile onto a second device explicitly throws away
empty lists and nulls:

    function serverSaidSomething(value: unknown): boolean {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      ...
    }

— `src/settings/hydrate.ts:770-776`

So on a second device, after a reinstall, or on any sync, "answered none" silently becomes "never
asked". **The design would have shipped a bug it was specifically written to prevent.** Note the
irony: the comment directly above that function *claims* empty lists are answers. It is wrong. This
is house rule 7 in the wild.

**The correction.** Emptiness is never carried in the value. Every "none" answer is carried as a
*flag* — and this is what finally gives the seven orphaned declined flags a reader. The block gains
two members, is restored as an object (objects survive the guard), and every reader asks the flag
rather than measuring a list's length.

## 2.3 The new fields

| Field | Type | Where it lives | Migration | What reads it |
|---|---|---|---|---|
| **Route** | The route's name, plus a flag saying whether ICEFALL assumed it | On the goal | None | The training target (see below) |
| **Capacity — hours + metres climbed** | Bands (e.g. "4–6 hours", "600–1,000 m") | Profile + answers | None | The fitness figure on readiness, marked self-reported |
| **Capacity — pack weight + back-to-back days** | Bands | Profile + answers | None | **The coach prompt only.** ICEFALL holds no measured figure to compare either against |
| **Hill access** | weekly / monthly / trips / almost never | The training shape | None | **The plan generator** — the only new field that reaches the plan |
| **Experience markers** | Multi-select of seven things you have done | Profile + answers | None | The Experience row on readiness (unscored, as today) |
| **Roped rock climbing (grade III+)** | A new skill label | Joins the existing skills list | None | The technical dimension, skill gaps, the prompt |
| **Trip interest** *(only if no objective)* | One of five | Profile + answers | None | Trek and stepping-stone suggestions |
| **Training time of day** | mornings / lunchtime / evenings / varies | Profile + answers | None | **The coach prompt only** |
| **Guided or independent** | guided / friends / solo / unsure | Profile + answers | None | The prompt, and the operator enquiry text. **Deferred out of signup** — see 6.5 |
| **Two new "none" flags** | Booleans | The declined block | None | The profile summary, and every reader of the two answers above |

### The one that reaches the plan: hill access

Only `almost never` changes anything. It swaps the long mountain day's *description and target* for
a stairs / treadmill / weighted-pack version. The substitute movements already exist and are gated
on kit you have already declared, so nothing new is invented.

**A correction to the original design's copy.** It read: *"Weekly, a few times a month, or only on
trips away: your long day stays a real ascent."* That is describing the result you get with **no
answer at all** — the generator prescribes a real ascent unconditionally. Presenting it as a
consequence of your answer is the app taking credit for a default, which is exactly what house
rule 1 forbids. The honest copy says three of the four answers produce the same plan, and names the
one that does not.

### The one with a hidden trap: capacity

Hours and metres climbed feed the fitness figure on readiness — but only until ICEFALL has recorded
four of your own sessions across 21 days, at which point the self-report is dropped entirely
(`mountainReadiness.ts:735`). That replacement rule is already built and already correct.

**Two things must be fixed before capacity is wired in, or it makes things worse:**

1. **`compare.ts` calls a self-reported figure "recorded".** Six strings read *"Your biggest
   **recorded** day in the last twelve weeks…"* while the underlying value is marked
   self-reported (`src/objectives/compare.ts:234`, `:240`, `:257`, `:263`, `:280`, `:286`). This is
   latent today only because nothing passes the figure in. Capacity makes it reachable — on the
   one page an operator reads.
2. **A false absence appears on readiness.** The self-reported fitness block always renders three
   rows, and the third is weekly ascent. Because we correctly refuse to invent a weekly figure from
   a single day, that row renders as *"1,500 m of ascent a week — **Not answered**."* to every new
   athlete, about a question the signup flow never asked them. "Not answered" is a claim about the
   athlete; "not asked" is a claim about ICEFALL. The three strings at
   `mountainReadiness.ts:642`, `:650`, `:658` must distinguish them.

### The one that is bigger than it looks: route

Capturing the route is small and worth doing on its own merits, because it fixes a real defect:
**today ICEFALL scores you against the hardest route on the mountain**, silently. `computePreparation`
takes the maximum-gain route as "what the objective demands" (`training.ts:794`), and a second
file deliberately copies the same pick so the two screens agree (`src/coach/sessionReason.ts:181-183`).
An athlete aiming at Mont Blanc by the Goûter is measured against the Trois Monts with no way to
say otherwise. The chosen route **replaces** that assumption in both places.

Making *requirements* route-aware is a different and much larger thing. See Section 8.

### Rule for all of them: new plan fields must be required, not optional

The plan's training shape is built in two places — the proper helper (`training.ts:899`) and a
hand-copied duplicate (`src/coach/planActions.ts:1014-1018`). Add a field to one and not the other
and the coach's plan previews silently disagree with the plan on screen.

**The mitigation is a typing rule, not vigilance:** every new field on the training shape is
*required* (it may hold "null", but it may not be absent). Then forgetting the second place is a
compile error, not a silent bug. Separately, the duplicate should be deleted and made to call the
helper — its own comment says it exists to prevent exactly this.

---

# 3. Mapping old answers to new

**Nothing is wiped. Nothing is silently reinterpreted.**

| Old answer | What happens | Why |
|---|---|---|
| Per-discipline experience level | **Kept, untouched, still shown** | Three live readers |
| The derived overall `experience` string | **Kept, and still written for new athletes** | See 3.2 — dropping it locks people out |
| Strength-training level | **Untouched. Not part of this change.** | It uses the same four words but caps every prescribed movement. Replacing it would silently change every session in the app |
| Technical skills | One label appended | Additive |
| Asthma / heart / recent surgery | See 3.3 | |
| Every new field on an existing record | Reads as "never asked" | Correct |

## 3.1 Beginner/Intermediate/Advanced/Expert to "things you have done"

**The mapping must not be stored.** A rung is what you called yourself. A marker is a factual claim
about something you did. Turning "Advanced — mountaineering" into "I have climbed a 4,000 m peak" is
ICEFALL putting a claim in your mouth — and that claim then travels to your readiness, your passport
and a document an operator reads.

**What is stored: nothing.** Existing athletes keep their rungs, and their markers stay empty.

**What is offered:** on the new screen, existing athletes see the markers their rungs *suggest*,
**pre-suggested and unticked**, computed **per discipline**.

| Rung | Suggested (unticked) | What auto-ticking would over-claim | What it would under-claim |
|---|---|---|---|
| Beginner | *none* | — | A beginner hiker may well have done a 1,000 m day |
| Intermediate | 1,000 m day hike; multi-day trek | A trek is not implied by "intermediate climbing" | Hut nights, glacier days |
| Advanced | + hut night; glacier day **only for alpine disciplines** | "Advanced trail running" implies no glacier day at all | 4,000 m peaks |
| Expert | + 4,000 m peak; organised own alpine trip, again alpine only | "Expert climbing" can be entirely at a crag — a 4,000 m peak is a serious over-claim | Nothing |

"Expedition above 5,000 m" is never suggested by any rung. There is no rung that means it.

Readiness shows **either** markers **or** rungs, never a conversion, and says which question was
asked. And it must say plainly that the new answer does not sharpen the score — the Experience row
is unscored today and stays unscored.

## 3.2 The lockout trap

The function that restores your profile onto a new device refuses anything without a text
`experience` value:

    if (typeof a.experience !== "string") return null;

— `src/auth/account.ts:447`

Returning nothing means you are routed back through onboarding, with your complete record sitting
on the server and unreachable. **So the multi-select must keep writing a derived experience string,
in the same commit.** This is not polish; it is the difference between a feature and a mass
lockout.

Related and unfixed: **an athlete who picks "I don't have one yet" already cannot be restored**,
because no objective name is written and the same function requires one (`account.ts:452`). Since
this plan deliberately makes the no-objective path richer, it will make more people hit it. The
three-line fix belongs in the same commit.

## 3.3 Moving asthma, heart and recent surgery — corrected

The original design said the old answers "stay exactly where they are… the profile still reads
'Recent surgery'." **Both halves are wrong, and I checked.**

- The label function de-slugs any id it does not recognise
  (`src/coach/limitations.ts:48-56`). Once `recent-surgery` leaves the list it renders as lowercase
  *"recent surgery"*, and `breathing` renders as *"breathing"* — **the words "Asthma or" are
  deleted from the athlete's own answer.**
- The edit screen builds its rows from the list (`CoachingProfile.tsx:425`), so a removed id sits in
  your record with no row on screen: **invisible, and impossible to untick.**

**The correction:** keep the three ids in a legacy list with their original labels, have the label
function consult it first, and have the edit screen render any id you hold even if it is no longer
offered — as a row you can untick but not tick, with a line saying it moved to the health screening.

**And a second correction, on privacy.** The old answers live in the general profile blob on the
server, on a table that **ICEFALL admins can read**. The new medical consent screen promises the
health answers are "kept apart from the rest of your profile" and never seen by anyone else. For a
migrated athlete that is true of the new table and *false of the old blob, where "heart" is still
sitting.* So: the first time an athlete passes the medical consent screen — whichever way they
answer — the three ids must be stripped from the server blob, after being copied (consented) or
discarded (declined). That is the first server-side deletion of profile data in the app, and it
lands on the same dependency as the delete function in Section 4.

## 3.4 A proposed change I recommend dropping

The original design proposed that the technical-skills score should be *withheld* rather than shown
as zero when none of your skills bear on the objective. On inspection that is **backwards**: it
makes "ticked five skills, none relevant" and "ticked nothing at all" produce the identical state —
destroying the answered/unanswered distinction this whole plan exists to protect. And it is less
honest, not more: an athlete who holds none of the four competences a big snow peak asks for
genuinely holds none of them, and no individual line accuses them of anything.

**Fix it with copy instead:** *"You have reported technical skills, but none of the four this class
of objective asks for — that is a gap in what this mountain needs, not a judgement on what you can
do."*

---

# 4. Medical screening

**Everything in this section is a draft that has not been reviewed by a doctor.** That is not a
formality. Nothing ships to an athlete until the review sheet comes back signed — the same
discipline that stops any mountain's requirements going live until two guides sign them.

## 4.1 What exists today

Nothing. No screening, no clearance concept, no medication question, no way to hold back a session,
no server deletion path for any data at all. This part is entirely new build, and it inherits three
repairs the rest of the app still needs.

One thing that *does* exist and is genuinely good: the consent machinery. Versioned wordings, an
explicit "with no wording there is no grant button" rule, four distinct states, a withdrawal that
deletes inside the same transaction. **It should be extended, not duplicated.** Caveat in 4.7.

## 4.2 The rule table

*CP = the plan starts lower and builds more slowly. AC = the slowest ascent schedule ICEFALL holds.*

| # | Input | Clearance | Plan | Altitude | Readiness row | Sent to the coach |
|---|---|---|---|---|---|---|
| 1 | Everything "no", no conditions, no medication, **and the note is empty** | none | — | — | — | nothing |
| 2 | **Chest pain / unusual breathlessness = yes** | recommended | CP + **no hard sessions prescribed** | AC | Not confirmed | recommended / true / true |
| 3 | **Told to keep to supervised activity = yes** | recommended | CP + **no hard sessions** | AC | Not confirmed | recommended / true / true |
| 4 | Heart condition or high blood pressure = yes | recommended | CP | AC | Not confirmed | recommended / true / true |
| 5 | Fainting / blackout / dizziness in 12 months = yes | recommended | CP | AC | Not confirmed | recommended / true / true |
| 6 | **Pregnancy** | recommended | CP + **no hard sessions** | AC + **no objective above 3,000 m** | Not confirmed + pregnancy line | recommended / true / true |
| 7 | **Surgery in the last 6 months** | recommended | CP + **no hard sessions** | AC | Not confirmed | recommended / true / true |
| 8 | Asthma or lung condition | recommended | CP | AC | Not confirmed | + carry-your-medication checklist line |
| 9 | Diabetes | recommended | CP | AC | Not confirmed | + blood-sugar timeline line |
| 10–13 | Epilepsy - blood clot - sickle cell - something else monitored | recommended | CP | AC | Not confirmed | recommended / true / true |
| 14 | Regular medication = yes | recommended | CP | AC | Not confirmed | + medication checklist line |
| 15 | Medication = no | — | — | — | — | — |
| 16 | **Any "prefer not to say"** | recommended | CP, **no hold** | AC | Not confirmed, naming which were left blank | recommended / true / true |
| 17 | "None of these" (answered) | — | — | — | — | — |
| 18 | **Optional note, non-empty** | **see 4.3 — corrected** | — | — | — | **not sent** |
| 19 | Consent declined | recommended | CP | AC | Screening not completed | recommended / true / true |
| 20 | Screening skipped | recommended | CP | AC | Screening not completed | recommended / true / true |
| 21 | **Consent withdrawn** | recommended | CP, hold lifts | AC | Screening not completed | recommended / true / true |
| 22 | **Never offered on this account** (server-confirmed) | none | — | — | — | block omitted entirely |
| 22b | **NEW — screening state unknown on this device** | recommended | CP | AC | "Health answers not loaded" | recommended / true / true |
| 22c | **NEW — started and abandoned** | recommended | CP | AC | Screening not completed | recommended / true / true |
| 23 | Any hold + "I've been cleared by a doctor" | **confirmed** | CP stays, hold lifts | AC stays | Confirmed — your own word | confirmed / true / true |
| 24 | Any hold + "I'll see a doctor first" | recommended | hold stands | AC | Not confirmed | recommended / true / true |
| 25 | Answered 12+ months ago, or objective now above 3,000 m | unchanged | unchanged | unchanged | + a re-ask row | unchanged |

**Combination rules.** Flags are the union — the strongest outcome wins on every field and nothing
cancels anything. A hold and a caution together show **one** headline, with condition-specific
notes below it. A hold and a "prefer not to say" together hold, with the withheld paragraph second.
The consequences paragraph is rendered **once**, never twice.

## 4.3 Six corrections the rule table needed

These came out of attacking the design. Each was a way the screening could fail **open** — toward
"no flags" rather than toward caution.

**1. The optional note could sit underneath "No medical flags."**
Row 18 said the note has "no effect whatsoever". So an athlete could type *"I get chest tightness on
steep ground and have to stop"*, tick "no" to everything (because "unusual shortness of breath" is a
judgement call), and be answered with *"No medical flags."* It is also the **only athlete free-text
box in the app that does not run the safety check** — the debrief, the coach chat and the coach
notes all do (`objectiveDebrief.ts:329`, `CoachChat.tsx:224`, `notes.ts:279`).
**Correction:** run the safety check before storing it, show the fixed safety card if it fires, and
make a non-empty note structurally incompatible with the all-clear outcome. And put "should this box
exist at all, if nothing reads it?" as the first question on the doctor's sheet.

**2. Absence failed open.** "Never asked" gave *no* protection, while "skipped" gave full caution —
the wrong way round, since "never asked" is what the app reads on a new device, after a reinstall,
in private browsing, when a stored record is corrupt, and on today's database (4.7).
**Correction:** only a *server-confirmed* "this account was never offered the screening" may be
row 22. Local absence, a failed read, and a not-yet-loaded record all derive **conservative with no
claims about the person**, and say on screen that the answers have not loaded.

**3. Changing an answer from yes to no was a silent, instant, unaudited unlock**, ending on a
screen reading "No medical flags" — to someone who reported chest pain minutes earlier.
**Correction:** removing a flag requires a confirmation naming what it was holding back; the record
remembers that a flag was once raised; and the all-clear message is unreachable for such a record —
it gets an "Your answers changed" message instead.

**4. A clearance was permanent and unscoped.** Cleared for a chest symptom in March, then ticking
"pregnancy" in June — and the March clearance silently covered it, including the no-altitude rule.
**Correction:** a clearance is recorded against the answers it was given for. Any new "yes" or new
condition re-raises the hold and re-asks, saying plainly the earlier clearance was for a different
answer.

**5. Withdrawal contradicted itself.** Row 21 described an outcome that the storage design made
unreachable — deleting the record means the app reads "never asked" and *all* protection
disappears. **Correction:** keep a withdrawal marker (a date, no health data) so row 21 is reachable,
and say on the confirmation, in plain words, that withdrawing lifts the hold on hard sessions.
Also: a withdrawal on one device must delete the local copy on the other, which means reading the
consent state *before* the medical record on every app start.

**6. The strong message could state a symptom nobody reported.** It is written for two inputs, but
four can trigger it — so a pregnancy-only hold would have read *"You have told ICEFALL about chest
pain."* **Correction:** the headline is composed from whichever inputs actually fired, with a test
that fails if a rendered outcome contains a clause that is false of the answers.

Two more, smaller:

- **The re-ask can never fire for someone who declined**, because both triggers key off "when did
  you answer", which is blank for them. That is the athlete the trigger exists for. Key it off
  "when were you last offered it" instead.
- **The model is told "clearance recommended" with no way to tell a raised flag from a skipped
  screening**, which invites it to invent a reason. Send a fourth derived flag —
  *screening completed: yes/no* — with its own line: *"ICEFALL is cautious because it holds no
  answer, not because of anything they have reported. Do not speculate, and do not press them."*

## 4.4 The language rules

Never "you have", never "you can't", never "it's safe". Always "a doctor who can examine you should
decide". The banned list must also catch implied diagnosis, which the first draft missed:
*this suggests, that indicates, consistent with, points to, rules out, your condition, your
diagnosis, high risk, low risk, mild, severe, should be fine, nothing to worry about, cleared to
climb, fit to climb.* A test reads the copy file from disk and fails on any of them.

Two symptom questions need a route out that the first draft only put on the question screen: if
chest pain or a blackout is **happening now**, the outcome screen must also offer ICEFALL's existing
fixed emergency wording, imported word for word rather than rewritten. And the inverse is a hard
rule so it is not over-wired: that emergency wording fires only from an explicit "this is happening
now" control, never from the historical answer — a faint eight months ago is not an emergency.

## 4.5 What the coach is told, and what it is never told

The model receives **four derived flags and nothing else**: clearance (none / recommended /
confirmed), conservative progression (yes/no), altitude caution (yes/no), screening completed
(yes/no). No answer, no condition name, no medication answer, no note.

**Your brief describes this as a property to preserve. It is not true today.** The model currently
receives the words `heart`, `breathing` and `recent-surgery` as raw text, plus up to 300 characters
of your own free text about your body (`src/coach/context.ts:951-958`). Moving the three conditions
out fixes the categories. It does **not** fix the musculoskeletal free-text box, which your brief
leaves in place by design — and that is the larger disclosure of the two.

**So the honest claim is:** *"No condition ICEFALL has categorised reaches the coach, and no answer
from the health screening reaches it. One free-text box does, because it is the box where you
describe an injury for the coach to train around."* The musculoskeletal note's copy must say so.

**Enforcement is the type, not the discipline.** The medical record is not importable into the file
that builds the prompt. That needs a test, because a convention with no test is a wish — and the
app already has the right test harness for it (`src/trip/offline.test.ts` walks the real import
graph from disk). Ship it with the feature, not after.

**Operators receive none of it.** Note that today this is a *discipline*, not a guarantee: the
builder is handed the whole athlete object and simply does not read the medical fields, and there
is **no test file in that directory at all**. This work adds the first one.

## 4.6 How a session is held back

**"Locked" is the wrong word and should not be used on screen.** ICEFALL cannot stop you going for
a run, and should not try — the free-record path in the tracker consults no plan and correctly
stays open. What it can do is **not prescribe** interval, strength or long mountain days. The copy
should say that.

The hold lives in the **generator**, not the interface. There is no padlock that refuses to open:
the day in your calendar simply *is* the easy session, with a flat row above it saying what was
planned, why it changed, and two controls — *I've been cleared by a doctor* and *Change my health
answers*.

Two corrections:

- **"Hard" is defined twice in this codebase with different members** — three focuses in one file
  (`briefing.ts:39`), two in another (`readiness.ts:100`). The medical hold must import the first,
  and a test must assert it, or the two surfaces will describe the same day differently.
- **Confirming a clearance would retroactively rewrite days you already completed.** Completion is
  stored by date, not by session identity, so an athlete who completed "Easy Hill Walk" on Tuesday
  and confirmed clearance on Wednesday would find Tuesday showing a completed *"Long Mountain
  Session"* they never did — and it would count toward their preparation percentage. The
  substitution must be frozen for days already past.

One rule to write down rather than leave implicit: **the substitution lives in the generator and
nowhere else.** It must never be expressed as a plan adjustment, because an adjustment carries a
free-text reason that syncs to a server table with no medical protections — which would quietly
turn "easy while your medical clearance is outstanding" into health data in the wrong place.

## 4.7 Consent, storage and deletion

**Consent:** two new rows in the existing consent tables (a purpose and a wording), plus one new
route value. Not a second consent system.

**Storage:** its own table, owner-only, with a delete policy and a delete grant. Three deliberate
differences from the profile table, each of which is *why* it is separate: no admin read clause; a
delete path (the profile table has none); and no stored derivation, because a second copy of the
rules is a second thing to drift.

**Deletion:** one database function that erases inside the same transaction as the withdrawal, so a
caller cannot forget. This is the **first server-side deletion path in ICEFALL**, and the two false
sentences in Settings (1.4) must be corrected in the same change.

**A correction on the local export.** The "Export everything ICEFALL holds" control sweeps every key
beginning `icefall.` into a downloadable JSON file (`Sections.tsx:3372-3384`) — which is precisely
why the new medical key is erased for free by "delete everything", and precisely why it would also
be **exported**. So an athlete taps Export and a file containing their conditions, medication answer
and free-text note lands in Downloads, typically to be emailed to themselves. Decide this
explicitly rather than letting a prefix sweep decide it: either exclude it and say so, or include it
behind a named warning.

## 4.8 A blocker you need to know about

**On today's database the medical screening cannot be reached at all.** The consent wording table
lives in a migration whose own header says *"DRAFT. NOT PUSHED."* With no wording in force, the
grant button does not render — by a rule with no exception (`src/health/consent.ts:28-31`). So every
athlete would take the "cannot ask right now" exit, three screens would be built, nothing would be
collected, and **nothing anywhere would say the screening did not happen**.

Two consequences: that exit must derive the *conservative* row rather than "never asked", so it
fails safe rather than silent; and the applied state of the database has to be settled before the
build starts. Six migrations in this repo declare themselves drafts, and a comment is not evidence.

    cd /Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/icefall-supabase
    supabase migration list --linked

**Do not run `supabase db push`.** It applies *every* pending file, and there are six queued. Apply
one at a time:

    psql "$DATABASE_URL" -f migrations/<one-file>.sql
    supabase migration list --linked   # confirm

---

# 5. The first coach session

## 5.1 Where it lives, and why not in the chat

A new screen at `/coach/intake`, offered as a dismissible row on the coach hub. **Not inside the
chat transcript**, for four concrete reasons: the transcript is re-sent to the model on every later
turn and capped at eight turns, so chip answers would be paid for repeatedly and then silently
vanish; seeding it deletes the chat's intro card permanently; "New conversation" would wipe it; and
the chat's send path would count intake text against your three free monthly conversations.

**"Opening the coach for the first time" is not a state the app can currently recognise** — the
nearest thing reappears every time you start a new conversation. The intake store *becomes* that
flag.

## 5.2 The flow

Six screens, five questions, chips as flat rows. The counter reads "2 of 5" and the denominator is
fixed — it cannot grow under you.

| Step | Question |
|---|---|
| 0 | **Recap.** "You're aiming for Mont Blanc by the Goûter route next July, training four evenings a week." then *Yes, that's me* / *Change something* |
| 1 | Why this one? *(chips + optional words)* |
| 2 | What worries you most? *(chips + optional words)* |
| 3 | What has stopped training before? *(up to two)* |
| 4 | How do you like to be coached? *(three chips)* |
| 5 | What does success look like? *(four chips)* |
| 6 | **Close.** One concrete next step, and a plain statement of what each answer does |

Skippable on every screen, resumable at the step you left, never blocking the coach, never a modal.

**It repeats no onboarding question.** Checked against all eighteen existing and all new ones: none
of the five has a counterpart. ICEFALL asks *which* mountain and never *why*; asks what your week
allows and never what went wrong before; and has no tone preference anywhere in the codebase at all.

Both free-text boxes run the safety check before anything is stored, so an acute symptom typed into
"what worries you" can never become a permanent fact in the coach's memory.

## 5.3 Where the model is and is not called

**It ships with zero model calls.** Both strings the brief assumed needed the model are fully
derivable from data the app already holds.

- **The recap** is built by a plain function from your objective, route, days and current volume.
  It cannot invent a mountain, works offline and signed out, and costs nothing. It is stored once
  and rebuilt only when one of the answers it names changes.
- **The closing next step** names your actual next prescribed session — a real date, from the real
  plan, that the "move it" control can actually act on.

**The brief's example closing line cannot be produced**: *"Your first benchmark is Saturday — a
600 m hill walk with 6 kg."* No benchmark has a date (benchmarks cannot occupy a plan day at all),
and 600 m with 6 kg is not one of ICEFALL's three defined tests. Naming the real next session is
strictly better.

This matters more than it sounds, because **the scarce resource is the call, not the money**. One
call costs about a penny. The free tier allows **three model calls a month**, enforced by the
server. Two calls would have spent two thirds of a free athlete's month before their first question.

If you ever want the model-written recap, it is specified behind a switch that is off: one call per
athlete ever, falling back to the plain version on any failure, and saying on screen that it spends
one of your conversations.

The recap also deliberately does **not** name your gaps, as the brief's example did. Naming a gap
needs the readiness engine, and its five call sites already disagree with each other about the same
mountain on the same day. Adding a sixth would widen that, and printing a gap the readiness screen
does not print would be a rule 2 breach. The clause can be added once those call sites are unified.

## 5.4 A correction: these answers must not be first in the bin

The original design put the intake answers in the one prompt block it also designated
**first to be dropped** when the prompt runs long. Four of the five answers have no other reader —
the closing screen says so in as many words. So for the athlete with the longest history, the very
person the intake exists to make the coach feel like it knows, **all four would reach nothing,
silently.**

**Correction:** the intake block is 640 characters against the notes block's 5,200. Dropping it
first buys almost nothing. It gets a small reserved allocation that is never trimmed, and the
coach's older notes are trimmed around it.

## 5.5 The tone preference, and the one absolute rule

Tone changes **warmth and length only**. It never touches a safety instruction, a deferral to a
doctor or guide, a refusal, or a statement that a figure is not available.

That is not a promise, it is four structural properties:

1. **Safety messages are emitted on a path where the tone value is not in scope.** The safety check
   returns *before* any prompt exists, at two independent points. The only function that reads the
   tone is the one that builds the prompt, and it is never called on either path.
2. **Tone is a sentence in the prompt, never a transformation of output.** This matters because
   safety cards render through the same components as a model reply — so a render-time tone
   transform *would* touch them. The design forbids one and the test asserts it.
3. **The import graph is narrow and one-directional**, and the test walks the real files to prove
   the safety module never reaches the tone module.
4. **The matching rule sits in the server-side block the client cannot edit**, ahead of everything
   the client sends. The two halves must ship together; the client half alone is the dangerous
   state.

---

# 6. Screen count and time

## 6.1 The assumptions

Reading at 200 words per minute, with 65% of on-screen words read on the first pass. Word counts
were measured from the actual files, not estimated. Interaction: 2 s for a single choice, 1.2 s per
yes/no/prefer-not-to-say row, 3 s for a multi-select, 6 s for a number with a keyboard, 1 s per
Continue tap.

**Validation:** applied to today's flow the model gives **5 min 46 s**, against an intro promising
"about a minute". Six independent readers put the same copy at "roughly 5x out". Two methods, one
answer — so the model is sound.

**A correction to the original estimate.** The interaction column was optimistic: the medical
screening was costed at 9 seconds for thirteen separate decisions, against the model's own stated
1.2 s per row. Re-run consistently, the numbers below are 40–60 seconds higher than first stated.
They are the ones a build should be held to.

## 6.2 The proposed flow

| # | Screen | ~sec |
|---|---|---|
| 00 | intro | 20 |
| 01 | Your name | 15 |
| 02 | What are you building towards? | 21 |
| 03a | Which way, and by when? *(route section + timeline)* | 30 |
| 03b | *or* What kind of trip are you drawn to? | *(14)* |
| 04 | What do you do, and what have you done? | 26 |
| 05 | What does your week allow? *(days - time of day - length - current volume - hill access)* | 70 |
| 06 | What can you train with? | 27 |
| 07 | What have you been taught? | 26 |
| 08 | How high have you been, and how did it go? | 26 |
| 09 | Medical consent | 34 |
| 10a | The health questions *(conditional)* | 58 |
| 10b | What ICEFALL will do with that *(conditional)* | 29 |
| 11 | Anything to train around? | 22 |
| 12 | One number ICEFALL genuinely needs *(weight)* | 14 |
| 13 | **Here's what ICEFALL understood** | 53 |
| 14 | building *(shortened to ~5 s)* | 5 |
| 15 | payoff | 26 |

**The route is a section on the timeline screen, not a screen of its own.** Two of the four curated
objectives have exactly one route in the data (Matterhorn, Mount Olympus), counted. A route *screen*
would ask those athletes nothing, and removing it mid-flow would move the progress count for a
reason they cannot see.

## 6.3 Before and after

| | Today | Proposed |
|---|---|---|
| Screens | 19 / 20 / 21 | 15 / 16 / 17 |
| Questions | 16 / 17 / 18 | 12 / 13 / 14 |
| Questions time, typical | 5 min 46 s | **7 min 10 s** |
| Door to door, typical | 6 min 43 s | **8 min 01 s** |
| The intro's claim | "About a minute" — out by ~5.8x | Two measured numbers |
| The progress bar | Grows 16 to 17 to 18 as you answer | Fixed at 14, drops once |
| Answers collected | 18 | 20, plus 7 moved after signup |

**Four fewer screens, eight new answers, a summary, a medical screening, and a progress bar that
cannot lie in the direction that matters.**

## 6.4 Under four minutes is not achievable, and here is the arithmetic

With **all nineteen of your items in signup**, the same model gives **around 9 minutes**. That is
the honest cost of the brief as written.

The proposal above already removes about two minutes by moving seven things after signup. What is
left cannot be trimmed further without deleting an answer that reaches a live engine:

- **The medical block alone is 121 seconds** (consent 34 + screening 58 + outcome 29). That is the
  price of the health screening and should be stated as a price, not absorbed.
- **Without the medical block: 5 min 09 s.**
- Getting from there to four minutes would require deleting Skills, Equipment and Altitude —
  every readiness input the app has. **Not recommended.**

**Recommendation: replace the single number with two measured ones**, derived from the flow so they
can be re-measured when the copy changes rather than rotting the way "about a minute" did:

> *14 questions at most — two drop out if you skip the health screening. About five and a half
> minutes, or seven with the screening. Measured, not guessed.*

## 6.5 What moves out of signup, and the contract that governs it

| Moved | Saves | Where it lives after | What the app does meanwhile |
|---|---|---|---|
| Strength-training level | 25 s | Edit coaching profile (already there) | Caps movement difficulty at moderate, and the session says so |
| Capacity (biggest mountain day) | 32 s | Complete your profile + the Readiness Test | Readiness returns "not measurable", which is not a fail |
| Guided or independent | 14 s | Complete your profile | The prompt prints "not given" |
| Gender | 8 s | Complete your profile | Nothing — it reaches nothing |
| Where you found ICEFALL | 9 s | Complete your profile | Nothing inside the app |
| Sex for the energy estimate | 17 s | The Fuel screen already asks and already writes it | The equation falls back |
| Height and year of birth | 16 s | The Fuel screen already asks | A different equation is used |

**Two hard requirements on this.** First, a deferred answer needs a real three-way state —
*never asked* / *declined* / *answered* — that something actually reads. The "Complete your profile"
list **is** that reader, which is what finally repairs the orphaned declined flags rather than
widening the hole. Second, moving "where you found ICEFALL" out of signup will reduce the response
rate on the only attribution question you ask. That is a business call, not an engineering one.

The wearable step stays exactly where it is — after the payoff, outside the question counter. It
already exists, it already has a Skip, and an OAuth round-trip to a third party is not a
four-minute-questionnaire kind of step. Its heading should stop saying "wearable", because nothing
returns data (see 7.1).

## 6.6 The progress bar

**Today's bar grows under the athlete** — "1 of 16" becomes "of 17" the moment you pick a
discipline and "of 18" the moment you pick an objective, while the intro quotes a fixed 18 from a
different source. Two sources, one number, guaranteed to disagree.

The rule: **the denominator is what you are committed to, and moving forward may only ever make it
smaller.** An undecided conditional counts as present — you are promised the longer flow and may be
released from part of it, never the reverse. The two mutually exclusive objective branches occupy
one slot. And the intro quotes the same computed number the first screen shows, so they cannot
disagree.

In practice: **14** from the intro through to consent, dropping to **12** if you skip the screening
and **13** if you answer it and nothing is flagged. It moves at most once, forward, at a moment you
caused and can see.

---

# 7. Risks, open questions and contradictions with the brief

## 7.1 Where the brief is not achievable as written

| Brief says | Reality | Nearest honest alternative |
|---|---|---|
| "Readiness and requirements must use this route" | Readiness takes no route argument at all, and requirements are stored per *mountain*. All fourteen curated records are **empty, unreviewed drafts** | Route drives the **training target** now, which fixes a real defect. Requirements stay per-mountain. See Section 8 for the cost of the other half |
| "Check the Matterhorn's requirements can reference [roped rock]" | The Matterhorn's record is literally empty and unreviewed. Nothing can reference anything | Add the tile; it reaches the coach and the readiness report. Do not add rock to the elevation-band fallback — Mont Blanc's normal route is in the same band and is snow |
| "Feeds the Guided/Independent costs toggle" | **No such toggle, and no guided-vs-independent axis in the cost model.** Re-verified today against the file as it currently stands | Defer the question out of signup |
| "Compared against structured route requirements" (capacity) | Pack weight and back-to-back days have **no requirement type and no unit**, and both lists are deliberately closed | Store both, send them to the coach, and say on screen that ICEFALL holds no measured figure to compare them against |
| "Replace Beginner/Intermediate/Advanced/Expert" | **Two different answers use those four words.** One is mountain experience (safe to replace); one caps every prescribed movement in the app | Scope it to mountain experience only |
| "[Time of day] used for session scheduling and notification timing" | A plan day carries no clock, and there are no notifications in the app at all | Ask it, send it to the coach, and say plainly there are no reminders to time |
| "Remove the 'if this phone holds no answer yet' wording" | That wording is **true** — the record genuinely refuses to overwrite | Keep the rule, drop the hedge, and name the way back: it *is* editable, on the Fuel screen. The profile screen's claim that an edit control there "would do nothing" is itself stale and must be corrected |
| "Offer only integrations that genuinely work today" | **No wearable returns data to ICEFALL at all.** Strava is outbound only by design; COROS links but cannot be read; the health service has no read route; Oura is on legal hold; Apple Health needs a native shell the app does not have | The step keeps its place after the payoff, stops saying "wearable", and offers Strava (out only), COROS (link only) and Skip |
| "The model never receives diagnoses" (as a property to preserve) | **False today** — three condition names and 300 characters of free text reach it | Claim what is true; see 4.5 |
| "Hard sessions stay locked" | No lock mechanism of any kind exists | Build it in the generator, and call it "will not prescribe" |
| "Altitude plans use the slowest profile" | The slowest schedule exists but is selected only by the altitude-illness answer, and **prints its reason as a fact** — routing a medical flag through it unchanged puts a false sentence on screen | Give it a reason-carrying argument; reuse the existing slowest row rather than inventing a fourth |
| "Deletion from settings" | **No server deletion path exists for any ICEFALL data** | This work builds the first one, and fixes two false sentences in Settings |
| "Stored as structured coach notes" (intake) | The notes store cannot hold it — closed categories, a closed source list, a prompt heading it would make false, and a founding rule that no model or app prose ever writes a note | A new store, shown beside the notes so you see one memory |
| "Only the recap and the closing line use the model, once" | Both are fully derivable | Zero calls |
| "Edit coaching profile must cover every answer" | Four are deliberately refused today, each with a written reason — and three are refused *because they reach nothing*, so adding controls would invent a reason to come back | Cover every answer that reaches something; for the rest, keep a row saying plainly that it reaches nothing |

One genuine gap in the current edit screen that should be fixed while we are there: **there is no
way to add or remove a discipline after signup.** The rows are built from what you already chose, so
an athlete who skipped the question, or who takes up ski touring, has a permanent dead end.

## 7.2 The one brief item nobody designed

> *"Schedule a benchmark test in weeks 1-2 of every new plan, so self-reported fitness is replaced
> by measured fitness early."*

**This is the only mechanism your brief gives for the second half of rule 3, and it is unachievable
as written.** Two independent reasons, both checked today:

1. **A benchmark result reaches no readiness figure.** The benchmarks module is imported by exactly
   two files — a screen and the coach prompt. Not by readiness, not by the comparison engine, not
   by the plan generator. The refusal is deliberate and documented.
2. **Even if it were wired, a week-1 benchmark cannot replace anything.** The threshold is four
   recorded sessions across 21 days. One benchmark is one session and one day.

**Choose one:**

- **(a) Say it plainly, and spend nothing.** Put on the readiness screen, beside the self-reported
  figure: *"This is your own estimate. It becomes a measurement once ICEFALL has recorded four of
  your sessions across three weeks."* Honest, correct, and free.
- **(b) Build it properly.** Wire benchmarks in as a third kind of evidence, which means deciding
  how a benchmark ranks against ordinary recorded sessions, and reopening a refusal that was argued
  deliberately. Rough size: **a week**, and it changes numbers athletes have already seen.

**Recommendation: (a) now, (b) considered separately.**

## 7.3 The transition nobody specified

Related, and the thing rule 3 actually turns on. **Today the change from self-reported to measured
fitness is a cliff, not a fade.** The self-reported figure is capped at 70 and renormalised over
what you answered; the measured figure scores raw with no cap. So on the day your fourth session
lands with 21 days of history, an athlete who reported a solid 1,000 m day and scored 62 can drop
into the teens — **with no sentence anywhere explaining that the number changed source rather than
the athlete getting worse.**

No section of this plan specified the overlap, and it must. At minimum: when the figure first
crosses that threshold, the summary names the change and quotes both.

## 7.4 Risks

| Risk | Why it matters |
|---|---|
| **The prompt is already being silently truncated** | The server cuts the prompt at 12,000 characters **from the end**, and the end is where the "areas you must not prescribe load into" prohibitions live. Measured at ~14,200 characters for an athlete with a full coach memory — so **the declared knee, ankle and altitude-illness constraints of the longest-standing athletes are already not reaching the model.** Every part of this plan adds to that block. This must be fixed first |
| **The coach may not work at all right now** | The coach's server function calls two database functions that exist only in a migration whose header says "NOT APPLIED". If that is accurate, every coach call is already failing to a scripted fallback. Settle it before reasoning about coach costs |
| **Shipping medical copy unreviewed** | Until the doctor signs, every medical screen must carry a visible "not yet reviewed by a doctor" line. Shipping without it, or shipping it as reviewed, is the single largest risk in this plan |
| **Signup accepts a five-year-old** | The birth-year check allows anyone aged five or over. A health screening and a health-data consent aimed at a child is a different legal object. Either raise the floor to 16 in the same change, or gate the screening on age |
| **Conservative-by-default penalises privacy** | Someone who simply declines the screening gets a slower plan than someone who answers "no" to everything. That is your ruling and it is defensible, but it is a form of pressure on a health question. The copy must say why, and the doctor should be asked whether it is acceptable |
| **Concurrency** | Another job is editing the mountain page and the cost data. The route list itself is **untouched**, so the route work is safe — but any claim about the cost model needs re-checking at build time, since that file has grown by a third this week |
| **Replacing the rungs screen empties a profile section for new athletes** | The discipline-levels editor is built from what you chose at signup. If new athletes answer markers instead, that section is empty for them from day one. It must be replaced in the same commit, not after |

## 7.5 Open questions I could not decide for you

1. Should the intake be offered at all to someone with no objective? "Why this one?" reads oddly
   with no "one".
2. Is "injury" acceptable as a non-medical answer to "what has stopped training before"? It is a
   history-of-interruption chip, never written to your limitations, and changes no session — but it
   sits one word from medical territory.
3. Should the markers screen retire the old rungs editor once markers are answered, or should both
   live in the profile?
4. Should crampon/axe/rope days be held back alongside intervals, strength and long days? They are
   skill work at low load, and this plan leaves them available.
5. Does the medical block stay inside signup, or run right after the payoff? Inside means the first
   plan is already the right plan; after means the building screen tells a story it may have to
   retract.
6. Should the health answers be included in the local export, or excluded?
7. "Your training week" now carries five controls on one screen. Is that scroll length acceptable on
   a phone, or should it split back into two screens at +27 seconds?

---

# 8. What this costs to build

Sizes are honest working estimates. **I have marked the two things that look small and are not.**

### Stage 0 — Preconditions. Nothing else should start first.

| Work | Size |
|---|---|
| Settle which migrations are actually applied (`supabase migration list --linked`) | **Minutes** |
| Fix the prompt truncation so the safety prohibitions stop being cut | **1 day** |
| Delete the duplicated training shape; make new shape fields required | **Half a day** |
| Fix the six "recorded" strings that describe a self-reported figure | **Half a day** |

### Stage 1 — Repairs that everything else depends on. **~3 days**

Give the declined flags a reader. Fix the no-objective restore lockout. Correct the two false
sentences in Settings. Correct the three pieces of stale on-screen copy. Add the first test to the
operator-disclosure directory.

*These are small individually and they are the difference between building on sand and not.*

### Stage 2 — The questionnaire. **~5 days**

New fields, the merged screens, the profile summary, the new progress rule, moving the save to the
summary, the seven deferrals and the "Complete your profile" list.

### Stage 3 — Route as a training target. **~2 days**

Capture it, store it, and replace the hidden max-gain assumption in both places that use it.

> ### The thing that looks small and is not
>
> **Making *requirements* route-aware is not two days. It is a week of engineering and a commitment
> you cannot buy back.**
>
> - Requirements are stored per **mountain** (14 records). Per route it is **21 records**, counted.
> - The reviewed state requires **at least two named certified guides per record**. That is
>   **42 signatures instead of 28** — a real-world commitment measured in months, not sprints.
> - It breaks a test that hard-asserts one record per mountain, changes a function signature used in
>   three places, and forces the review document to be regenerated.
> - **And it changes nothing an athlete sees until the guides have signed**, because all 21 records
>   would still be empty.
>
> **Recommendation: do the route half now (2 days, real benefit), and treat per-route requirements
> as a separate decision you make when guides are actually appointed.**

### Stage 4 — Medical screening. **~8 days, plus the doctor's turnaround**

| Part | Size |
|---|---|
| The rule engine and its tests | 2 days |
| Three screens and all outcome copy | 2 days |
| The migration: consent rows, the table, the delete function | 1 day |
| The session hold in the generator, including the retroactive-rewrite fix | 2 days |
| The review sheet, generated from the live copy | 1 day |
| Moving asthma/heart/surgery, including the legacy-label work and stripping the server blob | *inside the above* |
| **The doctor's review** | **Not engineering time. Start it early — it is the long pole.** |

### Stage 5 — The coach intake. **~4 days**

Two new stores, six screens, the recap and next-step functions, the settings group, the memory
screen, the tone preference and its nine-assertion test, plus one sentence added to the coach's
server rules.

### Total

**Roughly 22–25 working days of engineering**, plus the doctor's review running alongside, plus the
guide sign-offs if you choose per-route requirements — which I recommend you do not, yet.

**And the honest caveat:** Stage 0 and Stage 1 are eight days of repair before a single new question
is asked. They are not optional. Three of the four blockers found while attacking this plan were
cases where a *new* feature would have failed because of an *existing* defect.

---

# 9. Decisions needed before Step 2

Nine. Each has a recommendation, so approving is one message.

**1. Do we accept that signup gets longer, not shorter?**
Four fewer screens, but about 7 minutes of questions instead of 5 and three quarters, because of the
health screening and the summary.
-> **Recommended: yes**, and replace "About a minute" with two measured numbers.

**2. Do we move seven answers out of signup?**
Strength level, capacity, guided/independent, gender, where you found ICEFALL, sex, height and year
of birth — all into a "Complete your profile" list.
-> **Recommended: yes.** Note that "where you found ICEFALL" will get fewer answers. That one is
yours to overrule.

**3. Route: training target now, requirements later?**
-> **Recommended: yes.** The route half is two days and fixes a real defect. The requirements half is
a 42-signature commitment that changes nothing until it completes.

**4. Does the medical block stay inside signup?**
It is 121 seconds at position 9 of 14, where signup flows lose people.
-> **Recommended: yes, keep it in.** The alternative means the first plan is wrong and has to be
retracted.

**5. Does "prefer not to say" hold back hard sessions, or only make the plan cautious?**
-> **Recommended: cautious, not held back** — the app already refuses to escalate from an absence
elsewhere. Reversing it is one line, and it is the first question on the doctor's sheet.

**6. Do we accept that a declined screening produces a more cautious plan than an all-clear one?**
-> **Recommended: yes**, with copy saying plainly why, and with the doctor asked to confirm it is
acceptable.

**7. Do we raise the minimum signup age to 16?**
Today it accepts a five-year-old, and we are about to add a health screening and a health-data
consent.
-> **Recommended: yes**, in the same change.

**8. Are the health answers included in the "export everything" file?**
Today's prefix sweep would include them by accident.
-> **Recommended: exclude them**, with their own export on the health screen.

**9. Do we fund the benchmark work, or just say the true thing?**
-> **Recommended: say the true thing now** — one sentence on the readiness screen — and treat wiring
benchmarks into readiness as a separate week you decide on later.

---

This is Step 1. Nothing has been built. Approve or amend, and Step 2 follows.
