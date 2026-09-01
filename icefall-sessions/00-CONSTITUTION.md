# ICEFALL — Shared Constitution

**Every ICEFALL session reads this file first, before its own brief.**
There are four parallel Claude sessions working on one product. This document is
the part they all share. Your scoped brief is `01`–`04` in this directory.

Compiled 2026-08-28 from the handbook + a 108-agent verification pass over the
actual code. Where this file and `~/Downloads/ICEFALL-HANDBOOK.md` disagree,
**this file is newer** — see "What the handbook now gets wrong".

---

## 0. HOW TO TALK TO THE PRODUCT OWNER — read this before anything else

**The product owner has no coding experience.** They own the product and the
commercial decisions. They do not read code.

Never put file paths, line numbers, code, SQL, colour values, config or
framework names in a message to them as its substance. That is not what they
are for.

- **Asking for a decision?** Ask a *product* question in plain English, with the
  trade-off in terms of what a climber, a guide or a company would experience.
  Not *"should `DEFAULT_REFERRAL_PCT` be 7.5 or 10"* but *"when a climber books
  through us, do we take 7.5% or 10% of what they pay the company?"*
- **Reporting progress?** Say what now works and what it means. Not what you
  refactored. Keep it short.
- **Blocked?** Say what it stops them from having, not what threw an error.

Be as technical as you like in your own files, comments, commits and the
cross-session requests in this directory. This rule governs only what the human
reads.

### If the owner decides something in YOUR session, tell the brain

The owner talks to all five of us. A decision they make in your chat is invisible
to the other four, and this document is supposed to be the single record of what
has been settled.

So: **whenever the owner answers a product question in your session, send the
brain a one-line summary** (`ICEFALL project BRAIN` via SendMessage), or write it
into `FINDINGS.md`. The brain folds it into §6 and everyone inherits it.

Symmetrically: **do not cite "the owner decided X" to another session unless the
decision is in §6 or you are the session that received it.** Two sessions acting
on differently-remembered versions of one decision is the exact drift this
structure exists to prevent.

---

## 1. What ICEFALL is

A luxury, mobile-first product for outdoor athletes and mountaineers. The spine
is **Discover → Plan → Train → Perform → Explore → Achieve**.

Positioning: *the training app that knows your specific mountain* — readiness
scored against **that** peak, a kit list derived from **its** altitude, a
forecast broken into **its** elevation bands. Strava, Komoot, AllTrails and
TrainingPeaks do none of that.

The end user is **cold, gloved, out of signal, at 4 a.m. in a hut, deciding
whether to leave** — and carrying the consequence themselves. That single fact
is why offline-first, large tap targets, no popups and "never a zero for a
missing figure" are engineering requirements rather than preferences.

**The commercial differentiator is that the numbers are true.** ICEFALL is built
deliberately *against* the growth toolkit: no streaks, no social proof, no
urgency or scarcity, no leaderboard entry that was not earned, no badge granted
client-side, no verdict the app cannot defend. An assistant that optimises for
engagement patterns here is not making a trade-off — it is destroying the
product.

**State of the world, plainly:** there has never been a real user. No accounts.
No payment processor anywhere in the family. No money has ever moved. Only
`icefall-app` has ever been deployed.

---

## 2. THE HONESTY DOCTRINE — the decision procedure

This is the one rule that governs every session. When you meet a **new** case,
apply this in order:

> **1. Can ICEFALL measure it?**
>    Yes → show it, with its unit, and its provenance if self-reported.
>    No → go to 2.
>
> **2. Say why it is missing.**
>    Never a zero. Never a bare dash. Never an inferred number. Never a verdict.
>    `readMetric()`, `Score`, `Reading<T>` and `Unavailable` all exist to carry
>    the *reason* alongside the absence.
>
> **3. Would the figure change how someone plans a mountain day?**
>    If yes, and ICEFALL cannot measure it → **it does not ship at all.** Not
>    behind a flag. Not labelled demo.
>
> **4. If it ships anyway because the product owner decided so**, it goes behind
>    one named flag, it is deterministic, a notice prints wherever it could
>    change a decision, and the file carries an instruction to delete it.

Four corollaries already load-bearing in code:

- **A missing input is not a zero input.** Both matching engines drop an
  uncomputable factor and renormalise the remaining weights.
- **Absence of a claim is not a claim of absence.** `setDayAvailability` deletes
  the key rather than storing a default — *"'not set' and 'unavailable' are
  different statements."*
- **Self-reported can never outrank recorded.** `mountainReadiness` refuses to
  score a self-report above 70.
- **A number that could be read as permission gets a ceiling, not a caption.**

**Enforcement is four descending tiers:** the type system (`verified` is the
literal `false`; `status` is the closed union `"queued"`; `Score = value |
reason`), **64 exported honesty constants** that screens must render verbatim,
long arguing file headers, then convention. Never weaken a tier to make a
feature easier.

### Things that must never appear
- The phrase **"expedition ready"** or any summit clearance.
- **Heart-rate zones** — ICEFALL has never measured a threshold. Permanent,
  documented absence, not a gap to fill.
- **A fabricated person.** `DISCOVERABLE_ATHLETES` stays `[]`. An invented
  climbing partner is *"a hazard, not a placeholder."*
- **An exact distance to a person** — banded only (`approxDistanceLabel`), or
  you have built a trilateration attack.
- **A card form or a card on file.** There is no processor. A displayed
  "Visa ···· 4242" is a fabricated payment record.
- **A client-side badge grant.** Only `none` and `pending` are reachable.
- **A modal / sheet / interstitial paywall.** Upgrade prompts are INLINE ONLY,
  never blur the athlete's own data, no countdown, no scarcity.
- **A pre-ticked training session.** Fabricating completion once made a goal set
  that morning outscore an eight-month build.
- **A green tick beside a NOT-INCLUDED item** — use a `Minus`.

### Two engineering rules with teeth
- **Money is integer minor units** (cents / micro-dollars). Never floats.
- **Never `new Date("YYYY-MM-DD")` for a local day** — it parses as UTC midnight
  and shifts a day west of Greenwich. Use the existing `parseDay` helpers. This
  bug has been fixed several times already.

---

## 3. The seven folders and who owns what

Repo root: `/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main`

### The two existing consumer apps

| Folder | Port | What it is | Session |
|---|---|---|---|
| `icefall-app/` | 5190 | Athlete's phone PWA. ~188k lines, the bulk of the product. | **01 — Phone** |
| `icefall-web/` | 5194 | Public = waitlist only. Product lives at `/app/*`, DEV-gated. | **02 — Web** |

### The two NEW projects

Both CRMs are **new projects, connected to this one** — greenfield codebases in
the same monorepo that share ICEFALL's backend, money model and design system,
and that manage the data the consumer apps read. Neither is an evolution of an
existing folder.

| Folder | Port | What it is | Session |
|---|---|---|---|
| `icefall-crm/` | 5197 | **NEW.** ICEFALL's internal business CRM — the operating system for running the marketplace. | **03 — Company CRM** |
| `icefall-operator/` | 5196 | **NEW.** Operator self-service portal for expedition/trekking companies. | **04 — Operator CRM** |

### Shared and out-of-scope

| Folder | Port | What it is | Session |
|---|---|---|---|
| `icefall-supabase/` | — | Shared Postgres schema + RLS. The connection between all four. | **03 owns it** |
| `icefall-shared/` | — | `money.ts`, the one canonical commission model. | **03 owns it** |
| `icefall-admin/` | 5192 | Existing staff back office, ~1,640 lines, demo data only. **Reference material for Session 03, not the thing to build in.** Covers ~5 of the internal CRM's 15 modules with no data layer. Do not evolve it; mine it for patterns, then leave it alone. | *reference only* |
| `icefall-guide/` | 5193 | Individual guide's phone app — bookings, earnings, enquiries, availability, marketplace stats. The athlete app's twin, dark. | **05 — Guide app** |

**How the four connect:** one shared backend (`icefall-supabase`), two internal
interfaces (`icefall-crm` staff-facing, `icefall-operator` company-facing), and
two consumer surfaces (`icefall-app`, `icefall-web`) that read the *approved*
data the CRMs manage. One canonical `Company` record, one canonical `Product`
record — never a duplicate copy per app.

---

## 4. WHERE YOU WORK

**Every session works in the main checkout:**
`/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main`, on branch
`feat/ofm-workspace`. That is where the ICEFALL family lives.

**Do not work in a `claude/*` worktree.** They were cut from a branch that
predates the ICEFALL import and contain no `icefall-*` folder at all. If your
harness placed you in one, come back to the main checkout — the brain has ruled
on this, and it is not a per-session judgement call.

Worktree isolation is not a safer option here, it is the wrong one. Sessions 03
and 04 are two interfaces onto **one** backend; four isolated copies of the
schema defeats the entire architecture. Physical collisions are avoided instead
by ownership: every session writes inside its own top-level folder, and the
shared assets below have exactly one owner each.

Do not merge branches, commit, or recut worktrees to solve this — committing is
the owner's call (§6.2).

---

## 5. THE ANTI-DRIFT PROTOCOL

Four sessions editing one product will otherwise produce four schemas, four
commission models and four palettes. **Every shared asset has exactly one owner.
If you are not the owner, you file a request — you do not edit.**

| Shared asset | Owner | Everyone else |
|---|---|---|
| `icefall-supabase/migrations/*` | Session 03 | Write `icefall-sessions/requests/NN-<session>-<topic>.md` describing the tables/columns/policies you need and why. Never add a migration yourself. |
| `icefall-shared/money.ts` | Session 03 | File a request. 03 edits the source and runs `npm run sync`, which copies it verbatim into the consuming apps. **Never hand-edit `src/money/model.ts` in any app** — it is a generated copy. |
| Design tokens (`index.css`) | Session 01 | The phone app's palette is canonical. Copy from it; do not invent tokens. New colours go in `:root` as `--ice-*` **and** get re-exported through `@theme inline`, or no utility class is generated. |
| Trek data (`trekRecords.ts`, `credits.ts`) | Session 02 | Generated web-side. **Never hand-edit the phone app's copy.** They have already drifted once (147348 vs 147352 bytes) and there is no sync script — building one is a fair request. |
| This constitution | Whoever the owner asks | Propose changes to the owner; do not edit unilaterally. |

**Cross-session requests:** write a file in `icefall-sessions/requests/`, then
tell the product owner it is there. Do not assume another session will notice.

**If you find something wrong outside your scope:** write it down in
`icefall-sessions/FINDINGS.md` with `file:line`. Do not fix it. A cross-boundary
"quick fix" is how two sessions end up editing the same file in the same minute.

---

## 6. Decisions the product owner made on 2026-08-28

These are settled. Do not re-litigate them; do implement them in your scope.

1. **Finish the gold → azure rebrand.** The accent is alpine azure `#4B9BFF`
   (`--ice-azure`), obsidian is `#05070B`. `--ice-gold` no longer exists.
   Two files still hold champagne-gold hex *under azure names*, which is why
   grepping "gold" finds nothing:
   - `icefall-app/src/components/map/icefallStyle.ts:28` → `const AZURE = "#A78B5C"`
   - `icefall-app/src/share/renderCard.ts:127-128` → same, plus `OBSIDIAN = "#080B0D"`
   Sweep both to the live palette. **Session 01 owns this.**

2. **Replace the real companies with fictional names.** Elite Exped, Seven
   Summit Treks, Adventure Consultants and 14 Peaks Expedition are real,
   identifiable businesses currently carrying invented ratings, prices, summit
   rates and trip catalogues. Swap them for obviously-fictional names so the
   exposure disappears and Vercel Deployment Protection stops being
   load-bearing. **Sessions 01 and 02 in their own trees; 03 and 04 must not
   seed real company names either.**

3. **SUPERSEDED — see 3b.** ~~The consumer commercial model is a 5% service fee
   added on top~~ of the
   guide's advertised rate. The guide's rate stays intact and the client pays
   the fee. The older 12%-deducted-from-the-guide marketplace commission in
   `icefall-app/src/guides/` now contradicts this and must be reconciled —
   **Session 03 owns the money model**; Session 01 owns the screens that render
   it.

3b. **THE GUIDE MODEL IS A 15% COMMISSION DEDUCTED FROM THE GUIDE'S FEE.**
    Settled 2026-08-28 at 10%, **RAISED TO 15% BY THE OWNER 2026-08-31**. The rate
    is confirmed against a worked example, which is the only unambiguous way to
    state a fee:
    > A guide charges €1,000 for a day.
    > **The climber pays €1,000. The guide receives €850. ICEFALL keeps €150.**

    So: the advertised price IS what the climber pays — **no fee is added at
    checkout** — and ICEFALL's 15% comes out of the guide's earnings.

    The 10% history below is kept deliberately: it records what reversed and why,
    and a decision log that overwrites its own past cannot be audited. **Only the
    rate changed** — the deducted-not-added structure, and the rule that commission
    falls on the guide's fee and never on passed-through costs, are unchanged.
    `GUIDE_COMMISSION_PCT` in `icefall-shared/money.ts` is the only definition;
    `npm run sync` propagates it. A second literal anywhere is a defect.

    This reverses decision 3, which had chosen the 5%-added-on-top model. The
    owner has moved to the deducted model, at 10% rather than the 12% the code
    carried. Consequences:

    - `PLATFORM_COMMISSION_PCT` 12 → **10** (`icefall-app/src/guides/engagement.ts:42`,
      and the user-facing string at `:54` that states it to guides).
    - `SERVICE_FEE_PCT = 5` and the added-fee path **go away**. The `/book`
      checkout must stop adding anything to the advertised price.
    - **`totalsFor` (deducted) survives; `priceBooking` (added) should be
      DELETED**, not left beside it. Session 03's point stands and now points the
      other way: *"a convention is what let the phone app diverge in the first
      place."* Two functions plus a comment saying not to mix them is how this
      happened once already. Leave one.
    - Owner: Session 03 for `money.ts` (then `npm run sync`); Session 01 for the
      guide screens, the checkout, and the sentence guides are shown.

    **CORRECTION TO THIS ENTRY, from Session 01 who did the work.** The brief
    above described `PLATFORM_COMMISSION_PCT` as "the 12%-deducted" model. That
    was wrong about the file, and understated the problem: **the tree held FOUR
    commission models, not two.**

    | Site | What it did |
    |---|---|
    | `money.ts` | 5% **added** |
    | `guides/engagement.ts` | 12% |
    | the guide dashboard's quote composer | that 12% **added on top** — *"ICEFALL's 12% is added on top of your fee rather than taken out of it"* |
    | `earningsFrom`, sixty lines below, same file | `net = gross − platformFee` — **deducted** |

    So **both halves of a guide's own dashboard already contradicted each other**
    about whether the commission came out of their fee. The Earnings card said
    deducted; the quote composer said added. That predates 3b, and **a straight
    12 → 10 swap — which is what the brief asked for — would have preserved it.**

    Note the general hazard: *the file's own header comment was not describing
    the file.* A comment is not evidence of behaviour.

    Resolved by Session 01: `quoteTotals` stops adding, and
    `PLATFORM_COMMISSION_PCT` is now an **alias** of the canonical
    `GUIDE_COMMISSION_PCT`, not a second declaration — "leave one" applied to the
    constant as much as to the function.

    **And `PriceBreakdown` now takes an `audience`.** A client sees no
    platform-fee line at all, because under a deducted model there is nothing
    there for them to pay — *a line item sitting above a total reads as a charge,
    which is precisely what it was.* A guide sees the deduction and what they
    receive. The guide dashboard's "Sent to the client" block deliberately
    renders the CLIENT view, because it reproduces the document the client got.

    Verified by evaluating the modules live, not by reading them: €1,000 → client
    €1,000, ICEFALL €100, guide €900. And **€1,000 + €240 of hut fees → ICEFALL
    still €100** — the commission is on the guide's fee only, so ICEFALL does not
    earn more because a hut raised its charges.

    Unchanged and separate: the **7.5% operator referral fee** (decision 5) is a
    different stream — what an expedition company pays ICEFALL for a booking it
    referred. Keep the two structurally apart; `money.ts` already warns that
    mixing models on one booking is a real bug.

13. **ICEFALL CHARGES ONLY ON WHAT THE COUNTERPARTY KEEPS — NEVER ON
    PASS-THROUGH COSTS.** Settled 2026-08-28 against a worked example:

    > An Everest expedition sells for €62,000, of which roughly €10,000 is the
    > Nepal climbing permit the company collects and hands straight to the
    > government.
    > **The 7.5% referral fee applies to €52,000, not €62,000. €3,900, not
    > €4,650.**

    This **aligns the two streams for the first time.** The guide side already
    worked this way — `platformFeeFor()` charges the guide's fee only, so
    €1,000 of guiding plus €240 of hut fees yields €100, not €124. The referral
    side charged on `bookings.value_cents`, the whole gross, because the CRM
    specification says "gross transaction value". **The specification and the
    guide precedent contradicted each other and nobody noticed** until Session 03
    checked its engine against Session 01's.

    The principle, now general: *ICEFALL earns on the work a counterparty did,
    not on money that merely passed through their hands.* Permits, park fees,
    huts, transport and hired kit are excluded on both streams.

    **Schema consequence, Session 03's:** `bookings` holds one gross figure with
    no way to express a pass-through portion — *the question could not even be
    asked of the data*. That split now has to be recordable, and it must be a
    stated figure, never inferred. Make the change **before any commission has
    data**; afterwards it restates what operators owe.

    Session 03's holding test pins the CURRENT basis explicitly as pinning rather
    than blessing, so the change fails loudly instead of silently restating.
    Replace it, do not delete it.

14. **A COMPANY'S FILM APPEARS IN BOTH PLACES — and the page must render it
    before the editor offers it.** Settled 2026-08-29. A promotional video
    belongs on a company's own public page **and** in their block on a mountain
    page they hold a placement on.

    **How this came up is the useful part.** The owner asked for banner + video
    on both editors. Session 04 built a "Promotional film" section into the
    company editor — and Session 02, reading `Company.tsx` properly rather than
    reasoning about what a company page probably contains, found the page has
    **no video block at all**: no iframe, no embed, no `videoId`. The "Watch the
    video" control reveals the sentence *"No video has been published by this
    operator."* Verified independently by the brain: zero matches.

    So the editor shipped a **phantom section** — a working three-way source
    switch writing a field nothing renders. §6c one level in, and worse than the
    unfired-instrumentation case, because an operator can actually operate it and
    watch the row go green.

    **THE ORDERING RULE THIS PRODUCES, and it is the general one:**

    > **WIDENED 2026-08-29 — nothing may announce itself as working before the
    > thing it depends on exists.** A control that writes into nothing is
    > indistinguishable, to the person using it, from one that works.

    **Three forms of the same defect, found on the same day** (Session 02's
    generalisation, after the brain instructed the third one):

    1. **An editor control that writes into nothing** — Session 04's shipped
       "Promotional film" row, editing a field no page rendered.
    2. **A page block no data can reach** — what decisions 14 and 15 together
       would have produced: a company-page video section with no company-level
       film to fill it.
    3. **A declared contract entry with no implementation behind it** — what
       adding `video` to `SECTION_IDS` before the block exists would produce.

    The third is the one that shows the shape, because it is neither an editor
    nor a section but a *contract entry*, and it fails in a specific and nasty
    way: **a declared id with no element measures as `not-found` on every pass,
    forever** — and `not-found` is defined as the LOUD case the consumer must
    treat as an error. Declaring it early shows the consumer a permanent,
    unfixable error about something nobody can build yet, **and trains them to
    ignore exactly the signal the design depends on.**

    **The id and the implementation land in the same change.**

    Note the asymmetry that decides which side carries the constraint: an id the
    consumer *knows and never receives* is silent; an id it *receives and does
    not know* is an error. So the consumer may prepare early at no risk, and the
    producer may not declare early. The constraint belongs with the producer.

    **Why it is hard to catch** (Session 03): the editor is *correct in
    isolation*. The film switch validates, persists and shows the right state —
    nothing a reviewer of that file could see is wrong with it. It only becomes a
    lie **in combination with a surface that does not exist**, which is why the
    rule has to live above both sessions rather than as a check inside either.

    So: **Session 02 builds the video block on the company page FIRST.** Only
    then is Session 04's existing row valid. Until it ships, that row must be
    removed or visibly disabled — it is currently live in the rail.

15. **ONE FILM PER MOUNTAIN, not one per company.** Settled 2026-08-29, and it
    answers a question nobody had asked. A company can show a **different film on
    Everest than on Denali** — a climber looking at Denali should see Denali
    footage, not a general company reel.

    So `video_source`, `video_youtube_id`, `video_media_id` and the coherence
    constraint live on **`company_mountains`**. `banner_media_id` stays on
    `companies` and was never in doubt.

    **Session 03 raised this and then answered it itself**, reading decision 14's
    "both places" as settling "one film per company" — while the brain was
    putting the real question to the owner. The messages crossed and the columns
    were briefly built on the wrong entity.

    The distinction it drew is the one that made the question worth asking:
    *where a film renders is a display question and would not have changed the
    schema. Whether a company has one film or one per mountain is structural —
    and a **CHECK constraint** in the wrong place is the database enforcing a
    decision nobody made.* A nullable column in the wrong place is an
    inconvenience; a constraint is a migration of live operator content later.

    **Restore the absence test one level along:** assert the film columns are
    absent from `companies`, so a future session cannot put them back on the
    entity the owner ruled against.

16. **THE COMPANY PAGE SHOWS THEIR FILMS, LISTED BY MOUNTAIN.** Settled
    2026-08-29, resolving a contradiction the brain created between 14 and 15.

    Decision 14 put a film on the company page. Decision 15 put films on
    `company_mountains`. Together: **what film does the company page show?**
    There is no company-level film to render. Session 04 spotted it before
    anything was built into the gap.

    The answer: the company page **gathers what already exists** — the films
    they have published across their mountains, shown as a small set a climber
    can choose from ("Everest 2026", "Denali spring"). Nothing new is stored.
    No company-level film is introduced.

    Session 02 had already written "video block: owner-approved, build it" into
    its own handoff file for the session that would replace it. The hold caught a
    bad instruction sitting on disk waiting to be obeyed by someone with no
    memory of the conversation.

17. **TREKS ARE PLACEABLE, AND THEY SELL THREE SLOTS, NOT FIVE.** Settled
    2026-08-29. Mountains keep 1 Premium + 4 Featured. **Treks get three.**

    The owner's reasoning: 252 treks × 5 would create **1,260** further sellable
    positions against 260 on mountains, and scarcity is what makes a Featured
    position worth paying for. Three keeps a paid #1 on the Tour du Mont Blanc
    worth something. **The number can be raised later; lowering it means taking a
    slot off somebody who paid for it.**

    **Consequence for the schema:** the occupancy constraint must be enforced
    **per kind**, not as one hardcoded ceiling. Two values in one table, and the
    index has to know which row is which.

    **One table, renamed.** Mountains and treks share one placeable-inventory
    table with a `kind` of `mountain | trek` — verified safe because the brain's
    extract found **zero slug collisions** between the 52 peaks and the 252 treks,
    so a single TEXT primary key spans both.

    **The brain said a colliding slug "would break the primary key silently".
    Session 03 corrected it, and the correction is the useful half:** the primary
    key raises **loudly** — there is a test proving it. The real risk is narrower
    and worse. A seed written with `on conflict do nothing` — which is how the
    demo seed inserts destinations — **skips the collision without a word**, and
    the trek is simply missing. *Watch the upsert, not the constraint.*

    The table is **renamed `destinations`**, not left as `mountains` with a
    `destinations` view over it. A table named for one of the two things it holds
    is the same failure as a header comment that does not describe its file
    (§6b) — and two names for one thing is worse, because the next reader has to
    learn which is the lie. Nothing is deployed, so it cost a migration.

    **Canonical extract:** `icefall-sessions/requests/05-canonical-destinations-extract.json`
    — 52 + 252, generated from Session 02's owned catalogues by the brain rather
    than lifted by a consumer, so there is one known place a change has to reach.

18. **THE OPERATOR PORTAL IS LIGHT — decision 9's dark ruling is REVERSED for
    it.** Settled 2026-08-29 against the owner's newer mockup: white sidebar,
    white cards, dark text, every screen. The earlier dark instruction came from
    an earlier mockup set; **the newer mockup wins.** Session 04 rebuilds the
    portal light and matches the mockup's furniture (search boxes, Add buttons,
    row menus, pagination, enquiry/booking count columns, the profile-setup
    banner, the Analytics donut, the two-column Settings).

    Note what this removes: the deliberate register split where the portal felt
    like the athlete app. Both CRMs are now light work tools. The *athlete-facing*
    surfaces (phone app, icefall-web) stay dark — nothing about them changed.

    Two carve-outs the owner confirmed explicitly:
    - **Buttons stay BLUE, not the mockup's gold.** The azure decision postdates
      the mockup; the mockup is simply older on that one point. No change to any
      other app.
    - **The invented "Profile views 1,248 ↑56%" tile GOES IN, matching the
      mockup — local-only, doctrine tier 4.** It must carry the named flag and a
      delete-before-real-companies note, and it reverts to the honest
      "not counted yet" state before any real operator sees it. Session 04's own
      warning stands: that tile has to go back to telling the truth.

19. **A GUIDE OR OPERATOR MAY REPLY, BUT NEVER SEND THE FIRST MESSAGE IN A
    THREAD.** Settled 2026-08-29, and it OVERRIDES the deferred `messages_insert`
    comment (`chat.sql:188-216`), which documented a paid-booking gate.

    Session 03 refused to build the documented version and was right: that comment
    was written for the PHONE APP, where a client books a guide and the rule stops
    a guide cold-messaging strangers. The operator model runs the other way — a
    customer enquires, the operator replies, and only *then* is there a booking
    (`leads.status: new → contacted → qualified → quoted → booked`, where
    "contacted" *means* the operator replied, three states before "booked").
    Applying the paid-booking gate verbatim would freeze every lead at `new`
    forever: an operator could never answer an enquiry.

    Two artefacts disagreed and the newer design plus the owner is the tiebreak,
    not the older comment — exactly the §6b lesson, and Session 03 applied it
    unprompted.

    The rule the comment was actually protecting is off-platform solicitation, and
    a paid booking is a poor proxy (the risk is identical the day after a booking).
    The owner chose the narrower rule that protects the same thing at no cost to
    the flow: **the customer must open every thread; a company or guide may only
    ever reply.** Blocks cold outreach, which is the real attack.

    Implementation note Session 03 flagged: the old comment's `status <>
    'awaiting_deposit'` is a GUIDE-stream status absent from the expedition
    vocabulary, so the documented conjunct would not even have evaluated correctly
    against an expedition booking. The first-message rule sidesteps that entirely.

20. **THE FAMILY BECOMES ONE SYSTEM: web is live, the phone app is scheduled.**
    Asked for by the owner 2026-08-29. *"I add a company via the CRM, we give the
    users logins, and if they edit a mountain it auto-updates on the web and is
    scheduled for the next update on the app. Same for everything."*

    This is what the six-folder split was always for. Nothing new needs designing
    — the schema, the publication boundary and the approval engine already exist
    and are tested. What is missing is that **no app is connected to a live
    backend.** There is no Supabase project. Every app runs on local data with
    `isBackendConfigured()` false, which is a supported state, not a bug.

    **THE PROPAGATION MODEL, and the owner's instinct is the correct architecture
    rather than a compromise:**

    | Surface | How it updates | Why |
    |---|---|---|
    | `icefall-web` | **Live** — reads the approved record on request | A browser is online by definition |
    | `icefall-app` | **Scheduled** — refreshes on a cadence | The phone app is OFFLINE-FIRST by design. A climber at 4 a.m. in a hut with no signal reads cached data. It *cannot* receive an instant push and must never depend on one |
    | `icefall-crm` / `icefall-operator` | **Live** — staff and operator tools | Both are online work tools |

    So "live on web, scheduled on the app" is not a limitation to apologise for.
    **The phone app's whole value is that it works with no signal.** The scheduled
    refresh must therefore state, on screen, when the data was last updated —
    a cached figure presented as current is the honesty doctrine's failure in a
    new costume.

    **THE SEQUENCE, and only the first step is blocked on the owner:**

    1. ~~**A Supabase project exists**~~ **DONE, 2026-08-29.** Project
       `bckukbtwqqncnhzxygaf`, region `eu-west-1`. All 22 migrations applied and
       the canonical catalogue loaded. See **§22** for what is live and what the
       key rules are. *No longer blocked on the owner.*
    2. **Auth and logins** — ICEFALL creates a company, then its staff logins.
       Signup always creates an `athlete`, never a higher role (foundation
       migration invariant); staff and operator accounts are created BY ICEFALL,
       never self-published (Operator CRM spec §13).
    3. **One canonical record per entity.** No app keeps its own copy. The
       duplication already bit twice — `trekRecords.ts` drifted from the phone
       app's copy, and the operator portal seeds `co-lantern` while the web seeds
       `solukhumbu-expeditions`, which is why `LivePreview` currently shows a
       stand-in and says so.
    4. **Edits flow through the approval boundary that already exists** — operator
       edits create a `content_version`, live stays untouched, ICEFALL approves,
       and the approved record is what every surface reads. No new mechanism.
    5. **The scheduled refresh** for `icefall-app`, with a visible "last updated".

    Owner: **Session 03**, as backend owner. Consumers file requests.

21. **ONE CANONICAL COMPANY RECORD — `icefall-shared/companies.ts`.** Built
    2026-08-29 as the first buildable step of decision 20, at the owner's
    request. **This needed no database.**

    Before it, four apps held four company lists with **zero overlap**: web knew
    Solukhumbu, the operator portal knew Lantern Ridge, the CRM knew Northwind
    and Hollow Ridge, the phone app knew Falkenrath and Halvorsen. *"The same
    company" did not exist across the family* — which is why the operator
    portal's live preview had to render a stand-in and say so, and why nothing
    could propagate from the CRM to the web to the app: there was no shared
    identity to propagate.

    **The fixture is shaped as `public.companies`, deliberately** — same field
    names, same vocabularies, same CHECKs. So when a Supabase project exists,
    `COMPANIES` becomes a query and **no consumer changes**. A fixture shaped
    differently from its table is a migration waiting to happen.

    `assertCoherent()` applies the table's own
    `companies_verification_coherent` rule at module load: a company is
    'verified' only with BOTH a checked-at date and a checked-by reviewer, and
    carries neither otherwise. **Proven to fire** on a forged record. A seed that
    could not survive its own schema is not a seed, it is a future bug.

    Synced by `icefall-shared`'s `npm run sync` to all six apps alongside
    `money.ts`. 14 assertions in `companies.test.ts`. **Owner: Session 03**, same
    footing as the money model — consumers import, they do not edit.

4. **One accent colour across the whole family.** Everything follows the alpine
   azure rebrand — nothing stays gold. The staff and operator tools derive a
   *darkened* azure for legibility on a light background, exactly the way
   `icefall-admin` currently derives a darkened gold from the old accent. As of
   2026-08-28 the rebrand had reached only `icefall-app`: `icefall-guide` still
   defines `--ice-gold` and `icefall-admin`'s accent is gold-derived. If you
   touch a surface still on gold, bring it across.

5. **The operator-side referral rate is DEFERRED — do not pick one.** The owner
   has not settled whether it is 7.5% (CRM specs) or 10% (`money.ts:423`), and
   will decide later. Build the commission engine fully rate-agnostic:
   configurable, effective-dated, and with the rate stored **on the commission
   record itself** so changing it later never rewrites historical revenue. Seed
   a visibly-marked placeholder, never a real-looking number. **Do not ask the
   owner about this again — the brain session is holding the question.**

   **SETTLED 2026-08-28 — the operator referral fee is 7.5%.** The owner chose
   the figure from their own CRM specification, over the 10% that
   `money.ts:423` has always carried. `DEFAULT_REFERRAL_PCT` moves 10 → 7.5, and
   per-company overrides (the spec's worked example is Elite → 6%) and
   per-product overrides remain as built. Because the engine stores the rate on
   each commission record, **no historical figure moves** when this lands — which
   is exactly what that design was for.

   **AMENDED 2026-08-28, on Session 03's argument — seed the REFUSAL, not a
   placeholder.** "Visibly marked" does not survive the trip: the marking lives
   in the seed file, and the figure lands on a revenue dashboard with nothing
   attached to it. So **no rate is seeded at all.** `record_commission` raises
   *"no referral commission rule is configured"*, and the seed test asserts
   exactly that. That is both the true state of the business and a better
   exercise of the code path than a fake rate would be. Session 03 deliberately
   does not satisfy the spec's "seed commissions" line, and is right not to.

   *Note the CRM specs introduce a third rate: a **7.5% default referral fee**
   payable by the operator, with per-company and per-product overrides. That is
   a separate, operator-side stream and can coexist with the 5% consumer fee.
   `money/model.ts` already warns that mixing models on one booking is a real
   bug — keep the two streams structurally distinct.*

---

### Decisions of 2026-08-28, second round

6. **Scarcity comes out. All of it.** "Only N places left" and every variant is
   removed, not gated — there is no booking system, so the number is invented,
   and §1 bans urgency and scarcity outright. This settles the contradiction
   between `tripDetail.ts`'s comment and `DashboardShell:169`, which stated
   opposite rules: **`DashboardShell` was right.** If a real operator one day
   reports genuine remaining places, that is a new feature built on real data,
   not this one un-deleted.

7. **Ranking badges become "Featured".** "MOST POPULAR" / "BEST VALUE" /
   "PREMIUM EXPEDITION" are assigned by array index with nothing behind them —
   social proof, also banned by §1. They become **"Featured"**, which is *true*:
   ICEFALL sells placement, and a paid #1 slot is exactly what a featured badge
   denotes. The visual hierarchy an operator is buying survives; the unearned
   claim about other customers' behaviour does not.

8. **The public waitlist gets reworded.** `Waitlist.tsx:63` promises "training
   plans that get you summit-ready" on the **only page that ships publicly**,
   while `mountainReadiness.ts` is deliberately hostile to exactly that reading.
   Reword to promise the training without promising the outcome — the objective-
   specific angle ("training built around your specific mountain") is both honest
   and the stronger line, since it is the actual differentiator.

   **Final wording, chosen by the owner 2026-08-28:** *"Set your objective, and
   get the weeks and sessions it actually takes."*

9. **The two CRMs get different registers, because they have different
   audiences.** `icefall-crm` (ICEFALL's own staff) stays **light** — dense,
   data-forward, read in daylight beside a spreadsheet, and deliberately unlike
   the athlete app so nobody mistakes a staff screen for a customer one.

   **REFINED 2026-08-28.** The owner has since supplied a 23-page specification
   and a full mockup for the internal CRM, direct to Session 03. The mockup pairs
   a **near-black sidebar with a light working area**, so `icefall-crm` is no
   longer all-light. This does not contradict the decision — the *working
   surface* is still light, which is what it was about — but do not quote
   "icefall-crm is light" at Session 03 as though the chrome were settled. That
   spec also **supersedes the 15-module structure**: routes restructured, sidebar
   grouped into seven sections, and eight further tables identified (invoices,
   invoice_lines, payments, credit_notes, support_tickets,
   support_ticket_messages, verification_documents, contracts) — plus a
   deliberate refusal of a `subscriptions` table, because it would let the CRM
   hold a billing state it can never learn.

   `icefall-operator` goes **dark and cinematic**, in the phone app's own
   language — obsidian, hairline borders, the serif face for names and figures,
   azure doing the work. It is a product ICEFALL *sells* to expedition companies
   and is often the first thing a company sees of the brand; it should feel like
   ICEFALL, not like a back office. Reference canvas:
   https://claude.ai/code/artifact/7a564174-30c8-4cd9-bb4f-058045f9e3d0

10. **There are TWO accents, and the second one is commercial.** The
    "azure everywhere" decision (4) settled the *retired champagne gold*
    `#A78B5C`, which is now fully swept from `icefall-app` — the map, the route
    line, the live marker, the results map and every exported share card were
    rendering in the retired brand under variables *named* `AZURE`, and all five
    are fixed. **`--ice-gilt` `#E5B455` is a different thing** — added
    deliberately *after* the rebrand — and it **stays**:

    > Azure is the athlete's own product — their training, their objectives,
    > their record. Gilt is where money and other people's businesses are. A
    > climber should be able to tell from the colour alone, before reading a
    > word, that they have crossed from the thing they own into the thing
    > somebody is selling.

    **Scope — narrowed 2026-08-28 on Session 04's argument.** The gilt rule
    only means anything where a user sees **both** their own domain and
    commercial content in one app. That is the phone app and `icefall-web`.

    **It does NOT apply to the two CRMs**, because in an operator's own portal
    *every* screen is commerce, so a commercial accent would carry no
    information. The axis that matters there is **ours vs ICEFALL's**: azure for
    what the operator controls, neutral ink behind a lock for what ICEFALL
    controls. (And a *locked statement* states what is true, where a greyed-out
    dropdown says "ask us" and invites the negotiation the spec forbids.)

    Where it does apply, it only works while it holds absolutely — the moment a
    non-commercial surface borrows gilt, it stops carrying information.

11. **The demo community feed is DEMO-ONLY.** `SHOW_DEMO_COMMUNITY` was
    hard-coded `true`, so a plain production build shipped nine invented
    climbers with invented summits. Session 01 gated it off; the owner's ruling
    is that it should be **derived from `SHOW_DEMO_DATA`** — populated in DEV and
    in a demo build, empty in production — rather than hard-coded either way.

    **Precondition, inherited from §7.5 and non-negotiable:** `VITE_SHOW_DEMO=1`
    may only be set on a deployment that is **not publicly readable**. Vercel
    Deployment Protection must be enabled *and confirmed by an unauthenticated
    request being refused* before a build carrying demo data is promoted. If
    protection is ever removed, rebuild without the flag first.

    Unchanged and deliberately so: `SHOW_DEMO_RATINGS` stays `true` — the owner
    asked for those ratings specifically (§6.6 of the handbook), they are
    deterministic per route, and their notice prints on both detail screens.

12. **Departure availability is instant; price and dates wait for approval.**
    Owner-decided 2026-08-28, received first-hand by Session 04 in its own
    session and **confirmed directly by the owner to the brain on the same day.**
    The question put was: *"When a company's trip fills up or a date changes,
    should that show on Icefall straight away, or wait for Icefall to approve it
    first?"* Three options were offered; the owner chose **"spaces instant, rest
    approved"**.

    - `availability`, `spots_left`, `spots_total` → the operator writes directly,
      no approval. Availability going stale hurts the climber, and a company
      waiting on approval to mark a trip full is an operational trap.
    - `price_cents`, `departure_date`, `end_date`, and adding/removing a
      departure → through `content_versions`. These are advertised claims, and
      the two things an operator has most reason to overstate.

    Enforced by column-level privilege, not policy: `authenticated` holds
    `update` on the three availability columns and no more.

---

## 22. THE DATABASE IS LIVE (2026-08-29)

Supabase project **`bckukbtwqqncnhzxygaf`**, region **`eu-west-1`**. Decision 20
step 1 is done. **Nobody needs to ask the owner for this any more.**

### The two keys, and the one that must never be written down

| Key | Where it goes | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | every app's `.env.local` | public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | every app's `.env.local` | public by design; RLS is the boundary |
| the `sb_secret_…` key | **NOWHERE. Not in a file, not in an app, not in a request** | it bypasses RLS entirely |

`.env.local` is written in all six apps and confirmed git-ignored in all six.
**The name is `VITE_SUPABASE_PUBLISHABLE_KEY`, never `..._ANON_KEY`** — the wrong
name resolves to `undefined` and fails silently.

Anything `VITE_`-prefixed is compiled into the browser bundle every visitor
downloads. A secret key placed in one is not leaked *if* something goes wrong; it
is published as a matter of course.

### What is in it

24 migrations, **46 tables, 97 policies, 199 indexes, 54 functions**. RLS is on
for all 46. Catalogue loaded from the apps' own source of truth: **52 mountains,
252 treks, 51 trek→mountain links, 8 companies**, none verified.

### THE NEAR-MISS THAT IS THE REASON THIS SECTION EXISTS

`npx supabase db push` run from `icefall-supabase/` **does not push
`icefall-supabase/migrations/`.** The CLI looks for a directory named exactly
`supabase/`, does not find one, walks UP, and finds the repo root's `supabase/` —
which belongs to an unrelated OnlyFans agency product. The dry run listed **91
migrations about chatters, creators and whale paydays**, ready to apply to
ICEFALL's database.

It was caught only because the push was dry-run first and the output read rather
than skimmed. Nothing in the command said anything was wrong.

**So: always `--dry-run` first, and read the list of file names.** The safe way to
push is to copy `icefall-supabase/{config.toml,migrations}` into a scratch
directory as `supabase/` and run from there.

### The honest state of the seed

- **No company is verified.** `documents_checked_by` is a foreign key to a real
  profile; verification means a named person read documents on a real date, and
  no such person exists yet. The three companies `icefall-shared/companies.ts`
  had marked verified were downgraded to `pending` **in the fixture as well as
  the database**, so no app shows a badge today that would vanish the day it
  starts reading the database.
- **`destinations` is not publicly readable.** No `anon` grant, deliberately.
  Nothing needs it: the apps ship the catalogue as local data. When the
  marketplace goes live it will need `grant select on public.destinations to
  anon` restricted to `listed = true` — that is a decision to take then, not a
  grant to leave lying open now.
- **`catalogue_changes` has RLS on and zero policies**, reachable only through
  `catalogue_head()` / `catalogue_since()`. Verified: prospect companies do not
  appear in the public feed, so a stranger cannot learn who is being onboarded.
- The one genuinely public path is the **waitlist**: `anon` may INSERT and may
  **not** SELECT. Confirmed live — a stranger can join and cannot harvest.

### Two things fixed on the way in, both worth knowing

**The Appalachian Trail did not fit.** `duration_days_max` was capped at 200 and
the AT is 150–210. The data was right and the constraint was wrong — it had
encoded "treks are Alpine, one to three weeks" as a rule. Raised to 400
(`20260829190000`). The alternative, clamping the trail to 200 so the load would
succeed, would have made the product state a false duration for a real trail.

**75 foreign keys had no index** (`20260829200000`). Postgres indexes a primary
key automatically and a foreign key not at all. It costs on every filtered read
*and* on every parent DELETE — including account deletion, the operation nobody
load-tests and every user is entitled to.

### RLS: hoisted, and how to keep it that way

`20260829210000` rewrote 30 policies from `auth.uid()` to `(select auth.uid())`.
Bare, it is re-evaluated **once per row**; wrapped, once per query. Same rule,
same answer — a planner instruction, not a permission change. Proven by
re-reading all 97 policies and confirming that stripping the wrapping reproduces
the previous expression exactly.

**When you write a new policy, wrap it.** Zero policies currently re-evaluate per
row and that number should stay zero.

**Still per-row, and not fixable this way:** the SECURITY DEFINER helpers that
take a *column* as an argument — `is_company_member(company_id)`,
`is_thread_participant(thread_id)`. No wrapping can hoist those, because the
argument changes per row. `messages_select` runs a `thread_participants` query
per message. That is the next piece of work on this table.

---

## 6b. THE BRAIN'S RECORD IS CENTRAL, NOT AUTHORITATIVE — a false positive worth keeping

On 2026-08-28 the brain challenged `requests/01-operator-schema.md:602`
(*"`product_departures` — ANSWERED BY THE OWNER"*) on the grounds that **"the
owner was never asked and never answered"** and that it had *"verified the line
myself"*. Session 03, which had repeated the claim onward twice, corrected both
places with an unverified-provenance note.

**The challenge was wrong.** Session 04 had put the question to the owner
directly, in its own session, with three options; the owner chose one. The owner
has since confirmed it to the brain first-hand (decision 12).

What the brain actually verified was that **its own record was empty**. It then
asserted a negative about something it cannot observe — four sessions talk to the
owner and the brain sees none of those conversations.

> **The rule this produced, in Session 03's words:** the brain's record is the
> CENTRAL record, not the AUTHORITATIVE one. **An absence in it means "not yet
> reported", never "did not happen."**

Both halves still stand: challenging an unsourced claim was right, and repeating
one without checking was wrong. Only the wording — "never asked" where the
evidence supported "not in my record" — was the error. Say the second.

### It cuts both ways — and the other direction is the likelier failure

Session 03's own amendment, and it is the more useful half:

> *"An absence in your record means 'not yet reported' — but a PRESENCE in a
> session's report is not self-verifying either, which is what my original
> mistake was. I repeated 04's line without checking because the document around
> it was careful. If §6b only warns about absences, the next error will be an
> unchecked presence."*

So the rule is symmetric:

- **An absence** in the central record → "not yet reported", never "did not happen".
- **A presence** in any session's report → not evidence, until checked.

And note the mechanism, because it is the part that generalises: **rigour
elsewhere in a document is what makes its one unchecked line credible.** The
careful parts vouch for the careless one. Verify the specific claim you are about
to build on or repeat — not the document's general standard of care.

### Instance 3 — urgency, and knowing the fact you contradict

Session 03 found that `icefall-web` had never been in the money-model sync list,
and reported it as *"silent, live, and on the one surface with no login in front
of it"*, with the instruction to **relay it FAST**. Neither half was true: the
affected files sit behind the web app's own DEV gate, and `icefall-web` has never
been deployed. **No climber ever saw a wrong price.** The brain checked before
relaying and nearly did not.

Session 03's own account is the useful part, and it is worse than carelessness:

> *"`00-CONSTITUTION.md:75` says in plain words that only `icefall-app` has ever
> been deployed. I read that file in full at the start of this session. **I had
> the fact, and then asserted its opposite.** … The alarming reading felt
> conclusive enough that I stopped consulting what I already knew."*

**Urgency is a reason to verify, not a licence to skip it.** Attaching "act on
this fast" to an unverified claim is the one combination that reliably defeats
the next person's checking — and had it landed, it would have reached the owner
with the brain's authority behind it.

### The same failure in a fourth costume: a comment is not evidence

The brain described `PLATFORM_COMMISSION_PCT` as "the 12%-deducted" model —
taken from that file's own header comment. The file did not do that. It held a
composer that **added** the 12% and, sixty lines below, an earnings card that
**deducted** it, so a guide's own dashboard contradicted itself about their pay.

The generalisation, and it now has four instances:

> **The artefact that is supposed to tell you what is true is not evidence of
> what is true.** A green suite is not coverage. A careful document is not a
> verified claim. A header comment is not a description of the file.

And the operational half, which is what "apply the decision" can miss: **the
change the brief asked for — a straight 12 → 10 swap — would have preserved the
contradiction perfectly**, because the defect was never in the number. When
applying a decision, check what the code *does*, not what the decision's target
is named.

### Instance 5 — two answers, each coherent, jointly impossible

Session 02's formulation, and it deserves its own entry because **the defence is
different from every instance above**:

> *"Two answers given on two separate turns were each coherent and jointly
> impossible, and neither of you was ever looking at both at once. That is not
> the same failure as inferring something unread — it is a failure of never
> holding two known things next to each other. Reading the file does not help;
> only re-reading the decisions as a set does."*

Decision 14 (a film on the company page) and decision 15 (films live per
mountain-placement) were each correct answers to the question asked. The gap was
created by asking them on separate turns and never re-reading them together.

**The defence: after any decision that touches an area already decided, re-read
the neighbouring decisions as a set before acting on the new one.** Nothing in
the source can reveal this class of error — only the decisions can.

### Instance 4 — an unchecked claim from YOURSELF

Session 03 asked the sharper question (one film per company, or one per
mountain?) and then answered it itself from decision 14, which is silent on the
point — and wrote to the brain *"decision 14 answers my sharper question as well
as yours"*, in the same message where it noted the second question had never been
asked. It built the columns on the wrong table.

Its own account: *"I presented my own inference as the owner's answer... I would
have built it either way, because I had stopped treating it as open."*

Every earlier instance was **an unchecked claim from someone else**. This one is
**an unchecked claim from yourself** — harder to notice, and with no second party
positioned to correct it.

### The pattern across all three

Three-for-three: an unchecked claim, propagated with confidence, by whoever was
most sure at the time. Session 04's departures line, the brain's "never asked and
never answered", Session 03's "live and public". **That is not three people being
careless — it is what confidence does.** Which is why this section carries
instances rather than only a principle.

### Corollary: two numbers that differ are not automatically a contradiction

Session 02 reported that a page promised free cancellation at 14 days where the
money model gave 25%. The brain relayed it as a defect. **It was wrong**, and 02
caught it only because it went to fix it: `money/model.ts` holds **two** policies
— `STANDARD_POLICY` (tiered 60/30/14) governs an expedition, `FLEXIBLE_POLICY`
(100% to 14 days) governs booking a guide by the day. The 14 days was right all
along. "Fixing" it would have put a confidently wrong 60 on a guide-booking page,
and it would have looked like a tidy-up.

> **Check whether two sites describe the same thing before making them agree.**

The real defect was much smaller and quite different: the sentence was typed as
prose in three places with nothing tying it to the policy, so it could drift.
It now reads off `FLEXIBLE_POLICY`; the rendered text is unchanged.

Same failure as §6b in a different costume — acting on a plausible report without
checking the specific claim. Note the reporter was also the one who caught it.

The implementation was kept, because the argument stands on its own merits:
availability going stale hurts the climber, while price and the existence of a
departure are the two claims an operator has most reason to overstate. It is
simply no longer dressed up as a ruling.

**Why it propagated:** the request is a long, careful, well-sourced document, and
the one unverified line read exactly like the rest of it. Rigour elsewhere is
what made it credible.

**The rule (see also §0):** cite an owner decision only if it is in §6 or you
personally received it. Anything else is *"Session NN reports the owner decided"*
— and if it matters, ask the brain to confirm it before you build on it.

---

## 6g. IMPORTING THE CONSTANT PROTECTS THE RATE, NOT THE RULE

Session 02 rejected an 8-line local `guidingTotals()` helper in `icefall-web`,
even though it would have imported the canonical `GUIDE_COMMISSION_PCT`. Its
reasoning is the sharpest formulation of the shared-asset protocol yet:

> **Importing the constant protects the RATE and not the RULE.**

`totalsFor` rounds the commission *down*, so the remainder goes to the guide —
a deliberate commitment pinned by `money.test.ts`. A local reimplementation
would keep importing the right percentage, keep compiling, and keep passing the
canonical test suite in another repository, while silently disagreeing with
settlement in the other five apps. And `icefall-web` has no test files, so
nothing local would have caught it.

**A shared value is not a shared behaviour.** When the rule includes rounding,
ordering, or what happens at a boundary, importing the number is not reuse — it
is a second implementation wearing the first one's constant.

### Two things two sessions reached independently, which is why they are rules

- **A fee row was DELETED, not renamed** (02), and the client-side platform-fee
  line was removed entirely (01): *"a row in a column that sums to a total reads
  as an addition whatever it is called."* Under a deducted model there is nothing
  there for a client to pay.
- **A checkout should not react to a commission it does not charge.** `tripCost`
  now computes no commission at all — under a deducted model what the climber
  pays does not depend on it. Carrying `commission`/`guideReceives` on a checkout
  type behind a comment saying "never render this" is hidden-at-render, not
  gated-at-definition (§6c). Grep confirmed zero consumers.

  The concrete hazard that settled it: `QuoteTotals.perPerson` is **guiding-only**
  per person, and would have sat beside a BUNDLE total on a screen already
  printing "total · N climbers" — €500 against a real €1,340.

### An honest loss, recorded rather than absorbed

A climber could previously check the arithmetic themselves from the fee line.
`GUIDE_FEE_DISCLOSURE` is now the only thing carrying that transparency, so **it
must not be dropped in review.** Removing a misleading number removed a true one
with it; say so rather than counting it as a clean win.

### A sizing trap for anyone doing a similar migration

`tsc` reported 3 errors, all at import sites — which reads like a three-line fix.
It was four files plus stale prose: **a broken type import masks the property
errors downstream of it.** Budget from the consumers, not from the error count.

---

## 6k. THE SYNC LIST IS NOT THE CONSUMER LIST — found by Session 05, 2026-08-29

§6f says a fan-out must be verified at the leaves, because the source cannot tell
you who is *not* listening. This is the other half, and it is worse.

`money.ts` reached `icefall-guide` correctly. The sync script copied it, the file
was byte-identical to the shared source, and any check on the sync script would
have passed. **The app then ignored it and computed commission its own way** — a
fifth commission model, wrong three ways: wrong rate, wrong rounding, and wrong
*basis*, because it charged on everything the client paid including hut and lift
fees the guide hands straight on, against decision 13.

The lesson is about what a check can see. A consumer that RECEIVES the canonical
model and does not USE it is invisible twice over:

- invisible to any verification of the sync script, because the delivery was
  perfect and delivery is all the script can be asked about;
- invisible to a grep for the canonical name, because the offending code does not
  mention it — that is the entire nature of the defect.

So a sweep for "is `money.ts` everywhere it should be" returns clean, and a sweep
for "who imports `money.ts`" returns a list that *omits the very file that needs
finding*. **Search for the shape of the duplicate, not for the name of the
original**: raw percentage arithmetic on a money value, `Math.round(x * n / 100)`,
any local constant that looks like a rate. Session 05 swept all six trees that way
and confirmed there is no sixth model.

The same reasoning applies to `companies.ts`, `peaks.ts` and any future shared
asset. Synced is not adopted.

---

## 6l. CREDENTIALS ARE NOT A CONNECTION — 2026-08-29, caused by the brain

Provisioning Supabase meant writing `.env.local` into all six apps. That edited
no application file, broke no typecheck, and **silently changed the behaviour of
two apps that were never touched.**

Any app whose "am I connected?" check read the two environment variables flipped
to **true** — including apps with no `@supabase/supabase-js` dependency, no
client and not one query.

The damage was worst in `icefall-admin`, where the predicate drove rendering:

| | before | after |
|---|---|---|
| pill | amber, "Not connected" | **green, "Connected"** |
| text | "Every figure in this app is placeholder data…" | **"Reading live data from the shared ICEFALL database."** |

The honest warning was inside `{!configured && …}`, so becoming "connected" did
not merely add a false claim — **it deleted the true one.** On the app whose
entire content is invented revenue.

**The rule: gate on the object, never on the environment.** An env var records
what somebody *configured*; only a client object records what the app can *do*.
Those were the same thing right up until the moment they weren't, which is the
only moment that mattered. `icefall-crm` was already correct
(`isConfigured = supabase !== null`) and was unaffected.

**And the obvious repair is a worse bug**, which is the part worth remembering.
Session 05 found this in `icefall-guide` and nearly "fixed" it with
`disabled={!isBackendConfigured()}` — which would have *enabled* Send on an app
with no send path, so a guide would type a reply to a waiting client and watch it
vanish. The correct move is the opposite: leave the disabled control disabled and
the notice unconditional, and take them off in **the same change that makes
sending work**. `icefall-app` is in exactly this state now — a real client,
`isBackendConfigured() === true`, and zero queries. Its chat screens render
`BACKEND_NOT_CONNECTED` unconditionally and must keep doing so.

### The mechanism, which is sharper than the slogan (Session 05's refinement)

"Credentials are not a connection" is the memorable half and the one to quote at
a code review. It is not the half that explains why nobody caught this.

**A predicate's INPUTS became true while its MEANING stayed false, and the change
that did it was in another folder.**

Nothing in either app was edited. No typecheck failed. No test broke. The blast
radius of writing a `.env.local` was *six apps' honesty states*, and it was
invisible from both ends at once — invisible from the file being written, which
is a config file in a folder with no code, and invisible from the files being
broken, which nobody opened because nobody had reason to.

Contrast §6f, which is the nearest neighbour and is genuinely a different shape:

| | §6f | §6l |
|---|---|---|
| what the source cannot tell you | who is **not listening** | who will silently **start lying** |
| how it is found | verify at the leaves | ask what a config change makes *true* |

So the check this class needs is not "did the sync arrive" but: **after changing a
value that many things read, list everything that branches on it, and ask of each
whether its meaning changed as well as its input.** For a boolean that gates a
disclosure, the answer is almost always yes.

This is also distinct from §6b: there, an export had no callers. Here the
predicate had callers and kept working perfectly.

---

## 6m. PROVENANCE CHANGES THE REMEDY, NOT THE SAFETY MARGIN — Session 05, 2026-08-29

`verification_documents.expiry_source` distinguishes an expiry date **printed on
the document** from one **stated by the holder**. The obvious reading of the
honesty doctrine is that a self-reported date is worth less, so it should not
lapse a guide's listing.

**That reading is wrong, and the reason generalises.** The doctrine says
self-reported may never *outrank* recorded. It does not say it counts for
nothing. And here the two errors are not symmetrical:

- Hide a listing on a date the guide typed → they lose visibility, and can
  restore it by sending the certificate. Recoverable, by the person harmed.
- Leave it visible when cover may have lapsed → a client hires a guide with no
  liability insurance, on glaciated ground. Not recoverable by anyone.

So a self-reported expiry still lapses the listing. What provenance changes is
what the guide is *told*: "You told us this date — nobody at ICEFALL has seen it
written on the document. Send the certificate if it is wrong."

**The general rule: when a fact is weakly sourced, weaken the claim and the
remedy, never the safety behaviour.** Ask which way the harm runs before letting
provenance soften an outcome — and note that `{ status: "none" }` must render
"no expiry recorded", never "no expiry" and never "expired".

---

## 6n. `new Date("YYYY-MM-DD")` IS UTC MIDNIGHT — three instances, one file

`new Date("2026-10-04")` is parsed as **UTC midnight**, not local midnight. Compare
it against "today" and the answer is wrong for most of the planet for part of every
day. In `icefall-guide` a certificate expiring today read as EXPIRED in Los
Angeles, Midway **and Zurich**, where the seed guide is based — hiding a listing
on a day the document was still valid, which is lost income.

Session 05 fixed it in the model layer, then found it **twice more in the same
screen**: an "Expired" badge comparing `new Date(doc.expiresAt) < new Date()`
while `effectiveStatus` compared local days — so one line rendered a red
"Expired" badge three lines above copy saying the last day was still theirs.

### It is now SIX instances across two apps, in six costumes

| # | app | costume |
|---|---|---|
| 1 | guide | UTC-shifted expiry in the model layer |
| 2 | guide | UTC-shifted countdown beside a local date |
| 3 | guide | badge disagreeing with the app's own lapse rule |
| 4 | admin | a human-readable string (`"31 Dec 2028"`) parsed as a date |
| 5 | guide | a hardened parse that **failed open** |
| 6 | admin | the same fail-open, **reintroduced by the fix for #4** |

Instances 5 and 6 are the important ones, and both were written *while fixing
this very class*. Each author had already "fixed" their file and it read as done.

### THE RULE THAT ACTUALLY MATTERS

> **A safety test that cannot read its input must never answer "safe."**

`new Date("not a date")` is `Invalid Date`, and `Invalid Date < now` is **false**.
For an expiry check, false means *not expired*. So every unreadable value — an
empty field, a display string, `2026/10/04`, `null` — was waved through as valid,
including a genuinely lapsed certificate still in the old format. Silently, with
nothing in the console.

Measured, not reasoned about, in both apps. And `2026-02-31` is worse than
unreadable: JavaScript **rolls it forward to 3 March** rather than rejecting it.

Enforce it in the type, not in a reviewer: `parseDay` returns `Date | null`
(awkward on purpose, so every call site must say what it does), the lapse
predicate returns **true** for unreadable, and a countdown returns `null` rather
than rendering `NaN`.

### AND TELL THE HOLDER WHICH ONE HAPPENED — §6m applied

"Expired" and "we hold a date we cannot read" both block, but they are opposite
accusations. One says this professional let their paperwork lapse; the other says
ICEFALL broke its own record. Collapsing them produces a card arguing with
itself — Session 05 found a badge reading **EXPIRED** directly above "This is our
fault, not a lapse". Hidden either way; **blamed differently**.

Four outcomes, never two: *no expiry recorded* · *unreadable* · *expired* ·
*valid*. And `none` renders "no expiry recorded" — never "no expiry", never
"expired".

### THE AUDIT SHAPE — Session 05's correction, and it matters

The obvious grep is `new Date(` next to a comparison operator. **It finds four of
the six and misses both fail-open instances**, because in those the parse had no
comparison in it at all — the comparison was three files away.

> Audit the **constructor**, not the comparison site: *a date built from a value
> that is not an ISO instant*, wherever the comparison eventually happens.

Worth stating plainly, because the version of a check that misses the worst
instance is the one that gets adopted, and then everyone stops looking.

Everything the sweep turned up that is an ISO instant (`departureIso`, `endsAt`,
`startedAt`) is correct as-is. The shape is specifically a **calendar day, or a
human-readable string, treated as an instant**.

---

## 6o. HOW TO PROVE A TAILWIND CLASS IS REAL — Session 05's method, plus a correction

A dead utility class compiles to **nothing**, changes no behaviour, breaks no
typecheck and renders as the element's default. It has bitten this project three
times: four `icefall-app` token names used in `icefall-operator`, a
`--radius-pill` never re-exported through `@theme inline` so `rounded-pill`
compiled to nothing, and `text-amber` in `icefall-admin` where the caution
sentence silently rendered as ordinary grey body text.

**FIVE WAYS TO GET THIS WRONG. All five were tried, by both sessions, and every
one produced a confident result.** Three attempts at the check were "green" and
two of those greens were worthless.

1. **Variant-prefixed classes silently excluded — the worst one, because this
   check is their ONLY detector.** One mode, two mechanisms, and both happened:
   an extractor that *filters* on classes starting with `text-`/`bg-` never
   matches `hover:bg-raised` and drops it before the check runs; one that
   *strips* the prefix (`tok.split(":").pop()`) looks it up under the wrong
   selector and reports every `hover:`, `focus:`, `group-hover:` and
   `placeholder:` colour as dead.
   **A dead hover colour appears in no screenshot and no page-text read.**
   "Verified means looked at" structurally cannot reach a hover state — so for
   this family the stylesheet check is not a convenience, it is the sole thing
   that would ever find the bug. Both sessions' first audits excluded them
   entirely: 25 hand-picked and 24 filtered, containing **zero** variants between
   them.
2. **A hand-picked class list.** Session 05's "25/25 clean" was chosen from
   memory — a clean result over a list selected by the same faculty that would
   have caused the bug. Extracted properly it was 58. Ours was 24 by a filter
   that dropped variants; extracted properly, 42. **The list must come out of the
   source or the result means nothing.**
3. **Grep against the token list** flags `border-t`, `text-center`, `divide-y` as
   unknown — eight false positives. A check that cries wolf eight times gets
   switched off. §6h applied to tooling.
4. **A computed-style probe is worse, and fails in the dangerous direction.**
   `text-snow` and `border-hairline` came back "dead" because the base layer
   already sets that colour and that border — so the class matches the baseline
   being compared against. **False negatives precisely on the most-used tokens.**
5. **A class name written in a COMMENT is extracted as if it were markup.** The
   `icefall-admin` run reported exactly one dead class: `text-amber` — which
   appears nowhere but inside the comment explaining why not to use it. The
   warning about a dead class produced a false report of a dead class. Confirm
   every hit is inside an actual `className` before believing it.

   **The immunity, where it exists, is not where you would credit it.**
   `icefall-guide`'s extractor was unaffected — not because it strips comments
   (its line-comment regex only matches `//` at the start of a line, so a
   trailing comment survives), but because it reads **only string literals**, and
   a comment is not one. The property that saves you is the extraction's *scope*,
   not its cleaning. Worth knowing before relying on the wrong one.

### WHERE THE RULE HAS TO BE WRITTEN, AND WHICH CASE IS ACTUALLY DANGEROUS

The rule "never build a class name at runtime" belongs **at the points of
temptation** — the tone maps and variant maps where five explicit lines are the
unnatural thing to write and `` `bg-${tone}` `` is the natural one — not only in a
document nobody opens while editing a component. `icefall-guide` was keeping the
rule and documenting it nowhere; `icefall-admin` documented it in `data/demo.ts`
for a different solution (a CSS variable in an inline `style`, correct when the
DATA decides the colour) while its `Pill` said nothing.

**The hazard is tone names that ARE VALID TOKEN NAMES — not tone names that merely
look like colours.** This inverts the obvious reading, and the inversion is the
whole point:

A reviewer's one manual check is to expand `bg-${tone}` by hand and look for the
result in the palette.

| app | tone names | expansions that are real tokens | what the reviewer sees |
|---|---|---|---|
| `icefall-admin` `Pill` | neutral, accent, green, amber, **red** | **1 of 5** (`accent`) | four visibly wrong — the check works |
| `icefall-guide` `NoticeTone` | azure, summit, alert, danger, … | **4 of 6** | every expansion valid — the check passes |

So the *milder-looking* case is the safer one. `bg-amber` is not a token, which is
precisely how that bug was eventually caught. Where every expansion is a real
class, **the diff reads as verified on inspection and still generates nothing** —
the manual check does not merely fail, it actively confirms.

Corollary, and it is why the essay is not repeated everywhere: a map whose values
are obviously *not* token names (`variant === "primary"` → `bg-primary`) is the
low-temptation case for a stated reason rather than an instinct. Two placements in
`icefall-guide`, one plus a cross-reference in `icefall-admin`.

**AND THE RESIDUAL GAP, which no version of this check closes.** Reading string
literals cannot see a class assembled at runtime — `` `text-${tone}` `` or
`"bg-" + name`. Such a class is invisible to the extractor **and** generated by
nothing, because Tailwind scans source text and cannot see it either. **Dead and
unreported at once** — the check returns green over a genuinely dead class.

Verified empty across all six apps on 2026-08-29: no app builds a class name at
runtime. Better, four files already carry comments forbidding it
(`icefall-crm/src/screens/{Support,Finance,Leads}.tsx`,
`icefall-admin/src/data/demo.ts`), so this was already understood. The single
grep hit in `icefall-web/src/app/TripDetail.tsx:416` is an SVG gradient `id`, not
a class.

**If any app ever starts building class names dynamically, this check silently
stops covering it, with no signal that its coverage shrank.** Re-run the grep
when that changes.

**What works: ask the generated stylesheet, in the browser, against the app as
served.** Tailwind generates only what it finds in source, so this is the only
place the truth exists.

```js
const rules = [];
for (const sheet of document.styleSheets) {
  try { for (const r of sheet.cssRules) if (r.cssText) rules.push(r.cssText); } catch {}
}
const all = rules.join('\n');

// CSS escapes `:` `/` `.` `%` `(` `)` inside class names.
const cssSel = (c) => c.replace(/[:\/\.%()]/g, m => '\\' + m);
const forRe  = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The boundary must ALLOW `:` — a pseudo-class legitimately follows, as in
// `.hover\:bg-raised:hover` — and REJECT `\`, or `.text-snow` matches inside
// `.text-snow\/90`.
const check = (c) => new RegExp('\\.' + forRe(cssSel(c)) + '(?![\\w\\-\\\\])').test(all);
```

**Both escaping details were found by the check reporting live classes as dead.**
Without slash escaping, every opacity modifier reads dead (three in the
`icefall-admin` run). With `:` excluded from the boundary, every variant reads
dead (nine in `icefall-guide`) — and Session 05 nearly "fixed" nine perfectly good
hover styles on the strength of it.

**NEVER BELIEVE THE ANSWER UNTIL YOU HAVE PROVED IT CAN FAIL.** §6e pointed at the
check rather than at the code. The control set must contain a positive AND a
negative for **each escaping class**, or a broken matcher looks like a pass:

| control | must be | proves |
|---|---|---|
| `text-gold` | false | the azure sweep reached the **generated CSS**, not just source |
| `bg-quokka` | false | nonsense is rejected |
| `bg-accent-soft/99` | false | the slash matcher can still fail |
| `hover:text-quokka` | false | the variant matcher can still fail |
| `text-ink` | true | plain classes are found |
| `bg-accent-soft/40` | true | slash escaping works |
| `hover:bg-raised` | true | variant escaping works |
| `placeholder:text-faint` | true | a second variant family works |

The negatives matter as much as the positives: "escape everything" turns every
slash query true and looks exactly like a fix. And a *green* from an untrustworthy
assertion is worse than a red from one — **nobody investigates a pass.**

**Result after correcting all five failure modes:** `icefall-guide` 58/58 live
(23 opacity, 10 variant); `icefall-admin` 42/42 live (6 opacity, 7 variant), with
`text-gold` absent from the generated CSS. Both earlier figures — "25/25" and
"24/24" — were reported over lists containing zero variant-prefixed classes and
have been corrected here rather than left standing, which is §6i applied to our
own reports.

---

## 6p. A BRIEF GOES STALE MID-FLIGHT — write the ruling into the FILE

Session 04, 2026-08-29. `icefall-operator/src/screens/Leads.tsx`.

1. A subagent was briefed to add an origin filter to the inbox screen.
2. **Mid-run**, the owner sent a screenshot of that exact control: "also remove
   ts not neededd in messages". It was removed.
3. The subagent finished, found its brief unsatisfied, restored the filter — and
   flagged the conflict in its report rather than overwriting silently, which is
   the only reason it was caught.

**This was not two contradictory briefs. It was one brief that went stale
in flight.** The agent was correct against the instructions it held; those
instructions were simply older than the owner's message. **A long-running agent
cannot see owner input that arrives after it launches**, and no amount of care in
writing the brief fixes that, because the brief was right when it was written.

So the mitigation is not better reconciliation — it is **durability**:

> An owner decision that contradicts a live brief must be written INTO THE FILE
> at the point of change, not only into the next brief.

Session 04's second removal left a named comment at the site — *"NO ORIGIN FILTER
ON THIS SCREEN — OWNER DECISION, 2026-08-29"* — so the next agent reads the ruling
where it works, rather than re-deriving it from a brief that has aged.

A comment at the call site survives an agent that never opens the handbook. Routing
every such decision through the brain instead makes the brain a bottleneck **and**
still reconciles after the fact, once the wrong code is already written.

Corollary for whoever is co-ordinating: when you send a brief, assume it may be
executing while the owner changes their mind. Anything in it that is a *ruling*
rather than a *task* belongs in the code as well as the message.

---

## 6q. THE PRECISION OF THE OUTPUT IS NOT EVIDENCE ABOUT THE QUALITY OF THE INPUT

Session 04's line, from the Featured Slot pricing work, and it generalises past it.

The pricing framework publishes **613 prices to the euro** across 153 listings.
They regenerate exactly from one formula — verified, zero mismatches. Everything
about the output says *derived from data*.

Every input is judgement. §4 weights **operator competition** as the strongest
signal in the Visibility Index; §13 says the Indices must be corrected against
observed behaviour and calls them "a first position to be corrected, not
findings". **Neither quantity is measured anywhere in the ICEFALL family** —
nothing emits a listing-view event, so per-listing traffic exists only as demo
figures behind a flag in the operator portal.

The framework says this about itself. The risk is that a rate card does not: a
table of exact figures reads as measurement, and the caveat lives in a document
nobody opens while quoting a customer.

**So a surface that renders a derived number must carry the provenance of its
inputs, not just the arithmetic.** Showing the working — `250 x 0.42 x 1.00 x
2.25` — makes the calculation auditable and says nothing about whether `0.42` was
earned. Both are needed.

---

## 6r. A GUARD WRITTEN AGAINST A FIXTURE STOPS GUARDING WHEN THE SOURCE CHANGES

2026-08-30. `RealBusiness.tsx` exists so a page structurally cannot render a real
operator without its disclosure. It gates on one field:

    if (!company?.realBusiness) return null;

`icefall-shared/companies.ts` carries that field. **`public.companies` did not.**
So a company read from the DATABASE arrives with `realBusiness === undefined`,
which is falsy, and the guard returns null and renders nothing.

It does not fail loudly. **It fails by going quiet, on exactly the listing where
quiet is the harm** — a real business beside invented ratings with no notice.
And it was about to matter, because every app is mid-switch from fixtures to
this table. Found only because a real operator's name reached the live database
by accident.

Distinct from §6l. There, a predicate's *inputs became true* while its meaning
stayed false. Here the input's **shape changed** — the field stopped existing —
and a falsy default read as a confident "no". Ask of every guard: *what does it
do when its input is absent rather than false?*

The column is `not null default false`. `null` would mean "we do not know",
which for this question resolves to the same silent non-disclosure. **The safe
default is the one whose mistake is cheap**: a fictional company wearing an
unnecessary banner, never a real one missing its own.

---

## 6s. WHERE YOU PUT AN AUDIT DECIDES WHETHER IT IS COMPLETE

Same day. A company was created and deleted in the live database and **nothing
could say by whom** — `audit_events` was empty. `movePlacement` and
`cancelPlacement` route through functions that write the event in the same
statement; `createCompany` wrote the table directly. The entity the CRM exists
for was the one thing it did not record.

Three shapes were considered. Session 03's argument decided it:

| shape | what it misses |
|---|---|
| definer function pair | anything not calling it — and it is only complete if direct grants are revoked, which would break `approve_content_version` and still miss a service-role script |
| direct write + explicit `record_audit_event` | whatever the next author forgets |
| **trigger on the table** | **nothing — staff, definer functions, service role, and code not yet written** |

**The argument that settled it was about people, not principle:** the author of
the comment praising same-statement audits added unaudited company writes *the
same afternoon*. A shape that is "usually complete" degrades to whoever is
tired. A trigger cannot be forgotten because nobody has to remember it.

Two details worth copying: a **no-op write emits no event** (re-saving a form
must not claim a disclosure changed when it did not — a log full of non-events
is how people stop reading one), and the actor is recorded as **null for a direct
database connection**, which is what makes "was this a person or a script?"
answerable at all.

### An audit log's references must OUTLIVE their referents

`audit_events.company_id` carried `on delete set null`. Deleting a company
therefore **UPDATED that company's audit rows** — a rewrite of recorded history,
which the append-only guard then refused, so the delete failed. The guard was
correct and the foreign key was wrong. It was dropped; the column and index stay.

A dangling id in an audit trail is not an integrity violation. It is the trail
doing its job after the entity is gone.

### And do not defeat your own guard to tidy up

The append-only trigger then refused the brain's attempt to delete six probe rows
left by testing it. **They were left in the production log.** An audit log that
can be cleaned is not an audit log, and removing evidence of a test is exactly
the move the guard exists to prevent. They are honest rows: a test, by a direct
connection, correctly attributed.

---

## 6t. A COPIED PATTERN CARRIES AN INVISIBLE PRECONDITION FROM THE TABLE IT WAS BORN ON

2026-08-30, the brain, fixing the guide-listing hole.

To stop a guide listing themselves, `listed` was pinned in the UPDATE policy's
WITH CHECK by re-reading the stored value:

    listed is not distinct from
      (select g.listed from public.guide_profiles g where g.id = (select auth.uid()))

That reads `guide_profiles` from inside a policy **on** `guide_profiles`, so
evaluating it re-enters the policy: *infinite recursion detected*.

The shape was copied from `profiles_update_self`, which pins `role` and
`username` exactly this way and works fine. **It works there because that
table's SELECT policy is `using (true)`** — a fact about the neighbour, not about
the technique. Copy it one table sideways and the precondition silently does not
travel.

This is not §6f. There, a fan-out's source cannot tell you who is not listening.
Here, a pattern is correct in its birthplace and carries an unstated dependency
on its surroundings. **"Copy the working policy" is exactly the advice a careful
person follows**, which is what makes it dangerous.

### AND IT FAILED CLOSED, WHICH LOOKED LIKE SUCCESS

The recursion broke **every** update to `guide_profiles` — a guide could not edit
their own headline, bio or day rate. But the probe was testing whether a climber
could *list themselves*, and a recursion error reads as a refusal. **A passing
security test and a totally broken table were indistinguishable from outside.**

The fail-open/fail-closed distinction (§6n) inverted: failing closed is safer and
it hides. Only testing the **permitted** case found it — asking not "is the
forbidden thing refused?" but "does the allowed thing still work?"

§6e's rule pointed at a security fix: for every branch, ask what proves the OTHER
one runs.

**The fix was a trigger**, which is Session 03's §6s argument unchanged — a
trigger cannot recurse through RLS, fires for every path, and cannot be forgotten
by the next person writing a policy. The policy decides WHO may write; the
trigger decides WHAT may change.

---

## 6u. ONCE TWO TREES ARE DELIBERATELY IDENTICAL, A UNILATERAL IMPROVEMENT IS A REGRESSION

Session 02, 2026-08-30, converging the company monogram.

`icefall-web` and `icefall-app` each grew their own initials algorithm. Diffed
across eleven real names, **five of eight disagreed**:

| name | web | app |
|---|---|---|
| Chamonix Alpine Guides | CA | CG |
| Alaska & Yukon | A& | AY |
| Nima Chhiring Lama | NC | NL |
| Everest Spring 2027 | ES | E2 |
| Seven Summit Treks | SS | ST |

And worse than disagreement: on the web, **"Chamonix Alpine Guides" and
"Cordillera Ascents" both rendered `CA`** — two different companies sharing one
identity inside a single app.

The web took the first two words; the phone takes first-and-last, strips
punctuation and cuts at an em-dash. Session 02 converged onto the phone's version
rather than inventing a third.

### The rule that falls out

> Once two trees are deliberately identical, a **unilateral improvement to one is
> a regression.** Convergence has to be maintained by the rule that created it.

The live case: first-plus-last turns a trailing number into an initial, so
"Everest Spring 2027" gives `E2`. Preferring the last word that *begins with a
letter* gives `ES` and is plainly better — **and applying it in one tree alone
re-opens the divergence just closed.** It lands in both trees in one change or
not at all.

This is the mirror of §6k. There, a consumer receives the canonical thing and
ignores it. Here, two consumers agree and one of them then improves. Both end in
drift; the second is worse because it is done carefully, by somebody who checked.

**Where a shared asset genuinely cannot be shared** — separate npm trees, no
common package — the convergence is a convention, and a convention with no
mechanism needs the reason written at BOTH sites. `demo.ts` carries it.

---


## 6v. A PROBE MUST SEND WHAT THE CLIENT SENDS

**2026-08-30. The brain session reported that ICEFALL's public support form was
broken in production, generalised it into a five-session indictment, and sent it
to two sessions inside a minute. It was wrong. Session 01 challenged it and was
right.**

The probe was `POST /rest/v1/support_intake` with `Prefer: return=representation`
and it returned `42501 permission denied`. The conclusion drawn was that
`grant insert ... to anon` was missing from the database despite being present in
the migration file — that a migration had been applied, then edited, and never
re-applied.

**Every part of that was false, and one header caused it.** `return=representation`
asks PostgREST to hand the inserted row back, which requires SELECT. `anon`
deliberately has no SELECT — that is the table's entire security design, a
write-only drop box. The refusal was of the *read-back*, not the insert.

**The error named the right privilege and was read as naming the wrong one.** Its
hint said `GRANT SELECT ON public.support_intake TO anon` — it was describing the
privilege the probe had accidentally demanded, and it was read as confirming a
missing INSERT grant. The correct answer was in the response body, inverted.

**The generalisable rule is not "read errors carefully"** — the error *was* read,
and its hint pointed at SELECT. It is that **a diagnostic which does not match the
caller is testing a different system and reporting on this one.** The probe
differed from the real endpoint in exactly one header, and that header was the one
the table's security turns on.

**The codebase already contained the answer.** Session 02 had written, above the
line that sets `return=minimal`, and before any of this happened:

> PostgREST returns the inserted row by default, which requires a SELECT policy
> that deliberately does not exist — so without it the insert succeeds and then
> fails on the read back, and a visitor is told their message did not send when it did.

The bug, described in advance, in the file. Neither session went to the code,
because the response body looked like an answer in itself.

**TEST A GRANT WITHOUT WRITING A ROW.** Send a body that violates a CHECK
constraint. `23514` proves the privilege check already passed; `42501` proves it
did not. This is the documented way to verify `support_intake`, because the table
has no delete policy and every other method leaves a permanent row behind.

**On speed.** A wrong diagnosis corrected within the hour costs almost nothing.
What made this one dangerous was that it arrived **pre-generalised** — a
five-session theory rather than "one probe returned 42501, can anyone reproduce".
The finding and the theory travelled together, and the theory is what got relayed
onward. Send the observation first; the pattern can follow once someone else has
reproduced it.

## 6w. SHIP THE FIXTURE, NOT THE RULE — AND THE FIXTURE MUST SAY WHICH COLUMN IS WHICH

Two trees had to implement one monogram algorithm identically. Prose describing
the rule was not enough: "first and last" is ambiguous about whether it applies to
the filtered word list or the original, and that is precisely where two careful
implementations diverge without either being wrong.

**What closed it was shipping the expected outputs alongside the rule.** Both
sessions implemented from three numbered steps, then checked against sixteen
name→mark pairs. The two agreeing is what proved they had read the ambiguous
clause the same way — a check they each had to run anyway, surfacing a
disagreement no amount of prose would have.

**But the fixture had the same defect it existed to cure.** It was sent as
`Everest Spring 2027 ES` with no statement of which column was the name. One
session read name-first, the other mark-first; they converged **by both guessing
right**, not because the fixture told them. It is now checked in as
`readonly (readonly [string, string])[]` with the order enforced by the type.

**A fixture whose purpose is to remove ambiguity between two trees must not itself
be readable two ways.**

## 6x. A SELF-REPORTED GAP IS ONLY USEFUL IF SOMEBODY WITH THE ACCESS ACTS ON IT

Five sessions each reported honestly that they could not verify the support wire
end to end, because their checkouts had no credentials. Every one of those reports
was accurate and correctly refused to fold the gap into "done".

**The hole still survived all five, because every session was flagging it to the
other sessions rather than to the one party who could close it.** An honest gap
report is not a resolution; it is a request addressed to whoever holds the missing
access. **The session that can execute the path owns proving it** — and if nobody
can, that belongs in front of the owner, not in a status report.

Corollary from the same incident: when a session declines to re-probe because the
probe itself would leave junk in a live queue, that is good judgement, not
avoidance. Prefer a non-destructive check (§6v) over a write.

## 6y. A STALE AFFORDANCE IS A STALE SENTENCE IN A MEDIUM GREP CANNOT READ

A copy sweep for sentences made false by a shipped feature found none — eight
candidate strings, all eight correctly kept, because they described push
notifications, payments and messaging, none of which the new feature provided.
**A blanket find-and-replace would have deleted four correct guarantees.** Report a
negative finding with its reasoning; "nothing to change" and "I checked eight
things and all eight are still true" are different results.

**The one real defect was not prose at all**: a mail icon labelled "Email ICEFALL"
with no link behind it. Honest while there was no way to reach anyone; absurd the
moment a working contact form appeared directly above it.

**The sweep must include controls that promise a capability, not only prose that
describes one. An icon with no destination is a sentence with no verb.**


## 6z. AN ITEM IS CLOSED BY EDITING THE RECORD, NOT BY REMEMBERING IT

The owner captured 53 change requests offline on 30–31 Aug 2026. They live in
`icefall-sessions/BACKLOG-flight-notes.md`, and that file is the record.

**No session may consider one of those items done without moving its status to
`DONE` in the same change that does the work.** Not afterwards, not in a summary
message, not in a commit body — in the file. A session's memory does not survive
its own context, five sessions cannot see each other's transcripts, and the owner
cannot audit a claim that exists only in chat. An item ticked nowhere is an item
that will be rediscovered, re-scoped and re-argued by whoever comes next.

Three specific failures this exists to stop:

- **Silent narrowing.** A note that says "all settings pages need to work" is not
  closed by making three of them work. Split it into items rather than shrinking it.
- **Blocked masquerading as done.** `DESIGN` and `DECISION` items are not yours to
  unblock. Do not build a redesign the owner has not designed, and do not answer a
  decision on their behalf because waiting is inconvenient.
- **Deleting instead of moving.** Items are never removed from the file. A request
  the owner withdrew is `DONE` with the reason; a request nobody can find is a
  request the owner will assume was quietly dropped.

**The status assignments in that file were made by keyword on a first pass.** They
are a starting point and are wrong in places — correct them rather than treating
them as a ruling. §6q applies: the precision of the categorisation is not evidence
about the quality of the judgement behind it.



## 6aa. A WORKED EXAMPLE IN A DOCUMENT GOES STALE, AND NOBODY GREPS DOCUMENTATION

**2026-08-31. The owner raised guide commission from 10% to 15%. One constant moved
in one file and `npm run sync` carried it to six apps correctly. Within the hour,
at least seven written artefacts were false** — and every one of them was written by
someone who understood the model perfectly at the time.

Session 05 found four of theirs: a code comment asserting "the owner settled 10%" as
current, a worked example reading `ICEFALL 10% −€68.40`, **their own backlog line**
recording a verification that was true when written, and — worst — **their request
to another session, quoting "€180, not €204" as the example that session was most
likely to copy**.

The brain session found three of its own, including **constitution decision 3b
itself, which still declared "THE GUIDE MODEL IS A 10% COMMISSION"** — the rulebook
every session reads before acting.

**The rule: when a constant changes, the code is the easy part.** Grep the prose
too — comments, decision records, backlog entries, requests filed to other sessions,
handbooks, anything with a number in it. A stale figure in a document is more
dangerous than one in code, because code that disagrees with a constant usually
fails to compile or fails a test, and **a document that disagrees with a constant
just gets believed.**

Two corollaries:

- **A SELF-UPDATING NUMBER BESIDE A HAND-WRITTEN SENTENCE IS THE WORST OF BOTH.**
  The onboarding intro read "N questions — two are recorded for later"; the count
  derived itself from `ALL_QUESTION_STEPS` and stayed right, while the sentence
  beside it silently went false when the two became declinable and three questions
  were added. **Deriving half a claim makes the other half harder to notice** —
  the number moving is exactly what reassures a reader that the line is maintained.
  Derive the whole sentence or none of it.

- **When an ACCESS RULE moves, look for the sentence that explains it** (Session
  01, the messaging gate). `isLocked()` breaks loudly the first time the new policy
  refuses to match it — but *"You can message a guide once you have booked them"*,
  rendered under the padlock, survives the code fix untouched: no typecheck fires,
  no policy fires, it just keeps being believed. **The copy is a second
  implementation of the same fact, and it is the copy that fails silently.** Both
  halves change in one commit — and neither changes before the capability is real.

- **A request filed to another session is the highest-risk place for a worked
  example.** Its entire purpose is to be copied by someone who was not there. Write
  the RULE beside the number — "commission is on the fee, never the total" survives
  a rate change; "€180" does not.
- **Amend decision records, do not overwrite them.** 3b now reads "settled at 10%,
  raised to 15%" and keeps the reversal history. A log that erases its own past
  cannot be audited, and the next person cannot tell a change from a mistake.

- **NOT EVERY STALE FIGURE SHOULD BE UPDATED — some are load-bearing history, and
  "correcting" them destroys the evidence.** Session 05's test, and it is the right
  one: **is the number describing what IS TRUE, or what HAPPENED?** The first must
  move. The second must be dated and left alone. A handbook section recounting the
  2026-08-28 reversal keeps its €900/€100 worked example, with a superseding note
  above it; a handover list stating the current model must be changed outright.
  **Both fail the same grep**, which is exactly why a sweep needs a person reading
  each hit rather than a substitution across the tree.

- **The figures that survived the change were the interpolated ones.** Every stale
  hit in this sweep was prose holding a literal; every place that quoted the rate to
  a *user* — `GUIDE_FEE_DISCLOSURE`, `GuideDashboard.tsx:840` — built the sentence
  from the constant and self-corrected with no edit. That is §6aa's remedy stated as
  an observation: **the durable ones never held a number in the first place.**
  Prefer interpolation over transcription wherever a document is generated, and where
  prose must quote a live string, say that it interpolates.

- **Beware the reverse error too.** Handbook prose quoting an interpolated sentence
  verbatim *looks* like a hardcoded claim being shown to a user right now. Session 05
  checked two such alarms — `GuideDashboard.tsx:840` and a JSX comment at
  `BookingConfirm.tsx:367` — before relaying either. §6b: verify the alarming claim
  before passing it on.

## 6ab. A TEST INPUT CAN ENCODE THE CONDITION UNDER TEST, NOT JUST A VALUE

From the same change. Twelve test expectations had 10% baked into them and the suite
failed loudly — which is the suite working. **One of them needed a new INPUT, not a
new expected number, and that one was nearly missed.**

    // FLOOR, NOT ROUND. 3,335 cents at 10% is 333.5; the half-cent goes to the
    // guide. `Math.round` would have sent it to ICEFALL half the time.

`3335` was not an arbitrary amount. It was chosen because 10% of it is **exactly**
333.5 — a true half-cent, which is the condition the test exists to exercise. At 15%
it is 500.25, an ordinary fraction. Updating only the expected number would have left
a **passing** test that no longer tested anything, and a green suite asserting that
rounding still favours the guide when nothing had checked it. Changed to `3330`
(= 499.5) so the input still produces the condition.

**A test whose input no longer produces the condition under test is worse than a
failing one, because it is indistinguishable from a working one.** This sits beside
§6e's "ask which branches a green suite never enters" — here the branch is entered
and proves nothing.

**So when a constant changes, do not only ask "which expectations move?" Ask "which
inputs were chosen BECAUSE of the old value?"** Those are usually the ones with a
comment above them explaining why that number.



## 6ac. A NEGATIVE RESULT NEEDS A POSITIVE CONTROL

**2026-08-31, Session 01, caught before it was published.** Probing whether an
enquiry RPC existed, they called the candidate functions with an empty body `{}`
and got **404**. They were about to report "no enquiry RPC exists" — until they ran
the same probe against `open_support_ticket`, **which they knew existed, and also
got 404.**

PostgREST resolves an RPC by its **argument signature**. An empty body matches no
overload, so 404 means *"no function with that signature"*, not *"no such
function"*. The evidence that would have proved the enquiry system absent would
equally have proved the support system absent — and the support system demonstrably
works.

**The rule: before reporting that something is missing, run the identical probe
against something you KNOW is present.** If the control also comes back negative,
the probe is broken, not the thing. This costs one extra call and is the difference
between a finding and a false alarm sent to three sessions.

**This is §6v's sibling and the pairing is the point.** §6v is about a probe that
sends something the real client does not (`Prefer: return=representation`). This is
about a probe that sends *less* than any real caller would. **Both answer a
different question from the one asked, and both return a confident, specific,
wrong answer** — which is far more dangerous than an error. Two sessions hit this
shape in one day, from opposite directions.

**THIRD COSTUME, same day — the environment can be the thing you are measuring.**
Session 01 timed an intro animation and got *"still mounted after 2.85s"* against a
1.9s timer. Not a bug: `document.visibilityState` is **`hidden`** in the preview
pane, and a control 500 ms timer **measured 984 ms** — background-tab throttling at
roughly half speed. The element had correctly faded to `opacity: 0`; `AnimatePresence`
simply had not run its unmount callback yet.

**In a hidden preview pane, a timing-dependent assertion measures the throttle, not
the code.** This also explains why screenshots across this project come back blank or
mid-animation: entrance animations lag behind the wait. **Check `visibilityState` and
measure a known timer before concluding an animation is broken** — the positive
control again, applied to the clock instead of the query.

Three instances in one day, from three directions: a probe sending *more* than the
client (§6v), a probe sending *less* (§6ac), and a probe run in an environment that
distorts what it measures. **The common shape is a confident, specific, wrong answer
— which is more dangerous than an error, because an error stops you.**

**A FOURTH, and it resolved a standoff between two uncertain probes.** Session 03
reported `PGRST200` — "no relationship in the schema cache" — and hardened seven
reads around it. The brain session probed the same pair and got `PGRST201`,
*ambiguous*, which is the opposite cause. **Neither defended their sentence; a third,
isolating probe was run**, testing each relationship hint separately and reading the
codes rather than the prose:

    customer:profiles!bookings_customer_id_fkey  -> 42501  (RLS refusal — hint VALID)
    guide:profiles!bookings_guide_id_fkey        -> PGRST200 (no such relationship)

**`bookings.guide_id` references `guide_profiles`, not `profiles`.** The hint asked
for a `bookings↔profiles` relationship through a constraint that relates
`bookings↔guide_profiles`, so PGRST200 was a *correct* refusal. Both error codes
were right about different questions. No cache was ever stale.

**The root error is the one to carry: a check that "verified against `pg_constraint`"
listed constraint NAMES and never read their TARGET TABLES.** Seeing
`bookings_guide_id_fkey` in a list, and inferring from the name that it points at
`profiles`, is §6q pointed at oneself — **a constraint's name is not evidence of what
it constrains**, and a naming convention is a habit, not a schema.

**And note what the near-miss would have taught.** Reloading the schema cache would
have "fixed" nothing, changed nothing, and — because the ambiguous query would then
have been rewritten anyway — appeared to work. **A coincidental fix installs a false
cause**, and the next ambiguous embed would have been diagnosed as the cache going
stale again. The cheapest moment to kill a wrong explanation is before it succeeds.

**A REFUSAL, READ CAREFULLY, IS A READING INSTRUMENT (Session 01, the enquiry
wiring).** The phone app has no select on `destinations`, so it could not check a
slug the ordinary way. Two probes, each deliberately missing `sender_email` so the
visitor policy HAD to refuse both and nothing could be written:

    destination_id = "mont-blanc"             -> 401 / 42501   (RLS refusal)
    destination_id = "zzz-nonexistent-probe"  -> 400 / P0001   ("no such mountain or trek")

The nonsense slug dies on the object check BEFORE RLS; the real one gets past it and
dies on the missing email. **Which error fires is the proof the row exists.** A
question was answered without read access and without a write — two failing calls
where one succeeding call would have answered destructively. When you cannot read
and must not write, arrange two refusals whose difference carries the answer.

**A PROBE THAT READS THE WHOLE DOCUMENT DURING A TRANSITION IS READING TWO
SCREENS AT ONCE** (Session 01, the onboarding step-through). Their robot
oscillated between "5 OF 12" and "5 OF 13" and was nearly filed as a bug: with
`AnimatePresence` deliberately running WITHOUT `mode="wait"`, outgoing and
incoming steps are both in the DOM mid-transition, so the robot was clicking the
OLD step's buttons and toggling an answer that adds or removes a later step.
Scope the probe to the live subtree, not the document. Third in the family, with
the probe that compressed two user actions into one task (manufacturing a bug)
and the one that read a stale console buffer.

Corollary, from the same batch: **404 and 401 distinguish absent from unreadable.**
Session 01's table probes were sound precisely because the contrast carried the
information — `enquiries` 404 (absent) against `support_tickets` 401 (present,
ungranted). A probe that can only return one kind of failure cannot tell you which
failure you have.



## 6ad. THE DOCTRINE CROSSED INTO THE OWNER'S OWN DRAWINGS

**2026-08-31.** The owner used AI to generate mockups for the sixteen screens
awaiting design. **Three of the first three came back carrying honesty artefacts
the owner drew themselves, unprompted by any session:**

- A **Dashboard** tile where Active Users would sit, reading *"NOT BEING MEASURED
  YET / We're working on it."*
- A **Products** tile reading *"Not measured. We do not currently track views. This
  metric is not available"*, plus a footer banner: *"ICEFALL does not currently
  record view counts, impressions or click-through data. We are focused on revenue,
  bookings and enquiries — the metrics that matter."*
- A **Bookings** agreement tab heading a cancellation policy *"(AGREED AT TIME OF
  BOOKING)"*, with a "What Was Disclosed" list including *emergency evacuation not
  included*.

**Record this because of what it settles.** The honesty doctrine was argued for by
sessions, in file headers, against the grain of what a demo usually looks like. It
was defensible but never confirmed as what the owner actually wanted. It is now:
they reproduce it without being asked, in their own words, on their own screens —
and their phrasing is better than ours.

**Two operating rules follow.**

**Never paraphrase an owner-drawn honesty artefact.** Do not soften it, do not
"improve" the wording, do not fold it into a house pattern. It is the clearest
statement of intent in the project and it survives verbatim.

**REVISED 2026-08-31, SAME DAY, BY THE OWNER: "similar isnt enough can you not
make them 1:1."** The rule below survives only for PRODUCT DECISIONS hidden in the
frame (deleted screens, tenancy boundaries, removed controls) — those still get
escalated, never inferred. But for everything else, **1:1 means the frame too**:
accent colours, sidebar styling, split-view structure, tile weight, spacing. Matching
the drawing's content in our own house style is what "similar" means, and the owner
rejected it in those words. The demo face copies the drawing wholesale; production
keeps the real nav and real screens. The standard: build and mockup side by side at
the same width — if structure alone tells you which is which, it is not done.

**Treat a mockup's CHROME as unreliable ONLY where it embodies a product decision, while its CONTENT is signal.** The same
three drawings also deleted eleven built screens from the CRM navigation, put an
operator's name above ICEFALL's internal commission figures, and removed the phone
app's START control. **The generating AI knows nothing of tenancy boundaries, built
screens or product decisions** — it draws a plausible frame around the middle of the
screen it was asked for. The middle is the owner speaking. The edges are not.



## 6ae. A PRECISE FIGURE IS THE MOST CONVINCING FORM AN UNMEASURED NUMBER CAN TAKE

**2026-08-31.** Sweeping for one heart-rate claim, Session 01 found three. The third
was different in kind, not degree:

    tracking/training.ts:71    "Zone 2 throughout"
    data/mock/training.ts:37   "Zone 2 throughout"            <- the fixture twin
    data/mock/activities.ts:72 "Heart rate stayed in zone 2 for 78% of the session."

**"Zone 2" is a category. "78% of the session" is a measurement** — it requires a
heart-rate stream *and* a measured threshold to divide it against. ICEFALL has
neither; there is no HR pairing in the app at all. **And 78% is far harder to
disbelieve than "Zone 2",** because precision reads as provenance. A reader
discounts a vague claim and trusts a specific one, so **the more exact an invented
figure is, the more damage it does.** This is §6q pointed at the reader instead of
the author.

**When sweeping for a fabricated claim, rank by precision, not by how alarming the
words are.** The dressed-up percentage buried in a fixture outranks the obvious
phrase in a live module.

**Two method points from the same sweep, both worth keeping.**

**A defect with a fixture twin is the shape that survives its own fix.** Correcting
`tracking/training.ts` alone would have left the demo build still saying it, and the
demo build is what gets reviewed and screenshotted. Fix the pair or neither.

**The sweep's job is to find claims, not strings.** Session 01 deliberately did NOT
change `routes/relevance.ts:94` (`id: "zone2"`, label "Long aerobic day") or
`coach/liveCues.ts` (`"fat-burn"` as a focus id) — both render honest text, and
`sessionIntent.ts:57` goes further by naming the "fat-burning zone" misconception and
refusing it. **A grep flags all of them; only some reach a person.** Renaming
internal ids risks persisted data for no user-visible gain.



## 6af. A LENIENT PARSER RETURNING A PLAUSIBLE VALUE IS THE HAZARD — NOT ONE THAT THROWS

**2026-08-31. Session 01 reproduced the original lapsed-certificate bug inside the
function they had just written to prevent it**, and only found it because they tested
the *historical string from the incident* rather than a generic "bad input".

The guard was `new Date(iso)` checked with `Number.isFinite(d.getTime())`, under a
comment stating it failed closed. Verified against the live runtime:

    "31 Dec 2028"           PASSES  ->  2028-12-30   <- A DAY EARLY
    "12/31/2028"            PASSES  ->  2028-12-30   <- a day early
    "2026-02-31"            PASSES  ->  2026-03-03   <- a different month
    "31/12/2028"            rejected
    "not a date"            rejected

**`"31 Dec 2028"` resolving to the 30th is the original incident's exact mechanism**,
which until now was described as "parsed a day early" without an explanation. It was
never a crash. It was a lenient parser confidently returning the wrong day, inside a
check that decided whether lapsed insurance was displayed as valid.

**`Number.isFinite(getTime())` is validation theatre: it rejects only the inputs that
were never dangerous.** Garbage throws and gets handled. A plausible-looking date
sails through and is trusted, which is the whole problem.

**The remedy has two halves and neither is sufficient alone:**

1. **Check the ISO shape with a regex BEFORE constructing the Date.** Rejects
   `"31 Dec 2028"` and `"12/31/2028"` — ambiguous formats that mean different days in
   different locales.
2. **Round-trip the calendar day.** `2026-02-31` matches any sane ISO pattern and
   silently becomes 3 March. Only a value that comes back as the day you asked for is
   the day you asked for.

**And the strictness belongs at the WRITE path, not only at display.** If a system
stores what a person typed rather than a normalised value, every downstream guard is
patching a hole it did not make. A date that cannot be parsed strictly should be
refused at entry.

**The generalisation past dates:** any parser that accepts a wide range of inputs and
returns a single confident answer — dates, numbers with units, durations, currency,
version strings — fails this way. **Ask not "does it reject bad input?" but "what does
it silently do with input that is nearly right?"** That is where the trusted wrong
answer comes from, and it is the same family as §6ae: a precise-looking result is the
most convincing form of a wrong one.



## 6ag. FAIL-CLOSED BY LUCK IS NOT FAIL-CLOSED BY DESIGN

**2026-08-31.** `guide_profiles.credentials_verified` was dropped and replaced by a
derived state. The claim made for it was that consumers would "break loudly". Half
true, and the half that matters is the quiet one:

- An explicit `select=credentials_verified` errors. Loud.
- A `select=*` simply returns no such field. The property reads `undefined`,
  `undefined` is falsy, and the guide renders as **not verified**. Safe — and
  **silent**.

**That outcome was safe because of the field's polarity, not because anything
checked.** `verified` absent → falsy → "not verified" → correct. Invert the name and
the same mechanics invert the meaning: a dropped `hidden`, `suppressed`, `disabled`,
`locked` or `requires_review` reads `undefined` → falsy → **not hidden, not
suppressed, not locked** — and the thing that was being withheld is now shown, with
no error anywhere.

**So when a field is removed or renamed, do not ask "will it break?" Ask "what does
absent MEAN for this particular name?"** A negative flag and a positive flag fail in
opposite directions through identical code.

Two practical consequences:

- **Remove the type declaration in the same change** — and use the type as the
  sweep tool: in a codebase with `noUnusedLocals` off, deleting fields from the
  type FIRST makes tsc enumerate every reader; cut what the error list names, and
  the delete is provably complete (Session 01, PH-22). Make the type refuse, read
  the list.** Leaving
  `credentials_verified: boolean` in a TypeScript type after the column is gone means
  new code compiles cleanly against a field that can only ever be `undefined`. The
  compiler stops being a guard precisely where you most needed one.
- **Where a legacy field must survive** — client-side fixtures still feed it, say —
  comment it as legacy at the declaration, naming what replaced it. A field that
  exists in the type and not in the database is a trap with a two-line fix.

**The strongest form of the remedy: enforce the polarity at the SOURCE** (the
identity migration). `identity_verified` is a computed field ending in
`coalesce(…, false)`, so absent-record = unverified AT THE DATABASE — no consumer
can mint the mark from a missing row even by being careless. When a flag's safe
polarity matters, build it into the one place every reader must pass through,
instead of trusting every reader to remember §6ag.

This is the sibling of §6af: there, a lenient parser returned a plausible *value*;
here, a missing field returns a plausible *default*. **Both produce a confident wrong
answer with nothing raised**, and both were caught only by asking what the quiet path
does rather than whether the loud path works.

**Session 01 unified the pair in six words: A BOOLEAN IS JUST A CACHED PARSE OF A
DATE.** `credentials_verified = true` was a date comparison somebody performed once
and stored. `parseInstant` was a date comparison performed live on a string that had
already lost its meaning. **The danger in both is a value that stays plausible after
it stops being true** — and the remedy in both is the same: derive it, once, as close
to the source of truth as you can get, and never keep the answer.

**A corollary for sweeps, from the same batch.** Fixing a stale justification is not
copy-paste. `Expeditions.tsx` cited the guide constraint as a *parallel* for not
showing a company tick; after the migration the parallel breaks, but the conclusion
still holds **on an entirely different reason** — ICEFALL vets no company and has no
reviews. Session 01 rewrote the reason rather than the sentence, and added a warning
against reading "verification exists now" as licence to ungate the company tick.
**When an argument goes stale, check whether the conclusion survives on other grounds
before you either repair it or delete it.** Two claims resting on one fact should be
decoupled, not updated together.



## 6ah. A GUARD THAT READS AN ALREADY-DEFAULTED VALUE IS NOT A GUARD

**2026-08-31, second instance in one day of the same shape.** `coach/context.ts:146`
carried a comment naming the danger precisely — *"bodyMassKg falls back to 72 in
AppState, so it cannot be told apart from a real answer there"* — directly above:

    bodyMassKg: typeof bodyMassKg === "number" ? bodyMassKg : null,

which reads the **already-defaulted** context value. Always a number; the `null`
branch is dead; the check performs nothing. Result: the AI coach is told
"Body mass: 72 kg" **as a fact about an athlete who never gave one**, and plans
nutrition and training load against an invented body. Verified against the running
app: no `bodyMassKg` key has ever been written — every calorie figure in this build
is computed on the fabricated default.

The first instance was `parseInstant` (§6af): a comment stating fail-closed above a
check that failed open. **Both were invisible to the type system, because a
defaulted value carries the honest type.** `?? 72` launders `undefined` into a
plausible number one layer below the guard, and the guard then checks the launder's
output.

**The rule: a check on a value must run where the value can still be absent.**
Downstream of a `??`, an `||`, a default parameter or a schema default, absence no
longer exists to be checked for. Either hoist the guard above the default, or read
the raw source. And when writing a comment that names a hazard, put the code that
handles it in the same commit — both instances were comments describing a defence
that was never built, which is worse than no comment because the next reader
believes the defence exists (§6aa's costume for logic).

Sibling of §6ag: there, absence leaked through as a falsy default at a DROPPED
field; here, absence is erased by a default before the check. In both, the quiet
path manufactures a confident value out of nothing.



## 6ai. TWO COLOUR VOCABULARIES, TWO CHANNELS — SURFACES SPEAK LAYERS, MARKS SPEAK CLAIMS

**2026-08-31.** D4 (owner): GOLD badge = ICEFALL-checked credentials, small GREY =
identity verified, BLUE = paid member. §6.10 (design doctrine): gold accents the
COMMERCIAL layer, blue the athlete's OWN domain — "a climber should tell from the
colour alone that they have crossed from the thing they own into the thing somebody
is selling."

Session 05 (guide app) caught the collision the moment D4 landed: **their azure tick
meaning "ICEFALL read your documents" became a claim about a SUBSCRIPTION overnight,
with no edit anywhere** — a ruling changed what an existing mark means underneath it.
§6aa in a colour instead of a number. They also flagged, correctly, that D4 read
against §6.10 looks like the two golds/blues swapped meanings family-wide.

**THE RECONCILIATION — both rulings survive, because they govern different channels:**

- **§6.10 governs SURFACE ACCENTS**: section styling, backgrounds, CTAs, the chrome
  that tells you which territory a screen belongs to. Unchanged.
- **D4 governs PERSON-STATUS MARKS**: badges attached to a person or company,
  each carrying one claim. Owner's vocabulary, newer, and theirs.

A colour may serve in both channels without contradiction because a reader never
mistakes a screen's accent for a badge on a name. What is FORBIDDEN is within-channel
drift: no fourth badge colour without a ruling, no gold surface accent styled to look
like a badge, and **no mark whose meaning depends on which app you are in.**

Three rules Session 05 set that now bind every tree:

- **A mark must be interrogable** — gold links to the verification detail; a bare
  tick is a claim with nothing behind it.
- **Two marks need two sources** — identity and credentials verified by different
  records, or they are one mark wearing two colours.
- **Do not render a mark nothing in your tree can earn** (their app ships no blue:
  no membership concept exists there — §6c). Record the vocabulary for whoever adds
  the feature.

And their token move is the pattern: `--ice-credential` holding the family's gilt
VALUE — one gold in ICEFALL — but named for the CLAIM, because importing a token
named `gilt` imports the old meaning with it. **When a ruling changes what a colour
means, rename the binding at the point of use; keep the value.**



## 6aj. WHEN A NEW CAPABILITY LANDS, THE HAZARD IS WHAT SILENTLY KEEPS DOING THE OLD THING

**2026-08-31, Session 05, on landing real sign-in in the guide app.** The auth
mechanism worked first try. The defect was everything AROUND it: Home and Profile
kept reading `ME` — the invented sample guide — regardless of session, so a real
person signing in was greeted by **somebody else's name and somebody else's
bookings**. And the gold credentials mark had grown a second source: Verification
read the server's derived state, while Home derived the same claim from the seed —
so a guide ICEFALL had never checked would have seen gold on their own home screen.

**Nothing was edited to cause either.** Screens written when no session existed
carried on doing what they had always done, and sign-in arriving is what made them
wrong. This is the general form of a whole day of §6 entries: a sentence goes stale
(§6aa), a colour changes meaning (§6ai's origin), a data source keeps serving the
sample. **A new capability's diff shows what it changes; nothing shows what now
NEEDS to change and did not.**

**So landing a capability requires a displacement audit: list what the app read
before the capability existed, and ask of each source, "who reads this NOW?"**

**The audit found twelve more readers in the same tree a day later, and three of
them survive any screen-by-screen sweep** (Session 05's `sampleGate` follow-up —
one gate, fail-closed, because twelve per-screen conditions is the disease that
produced five commission models):

- **A localStorage store seeded from the sample.** Saved data looks like the user's
  own work — the one thing that should survive — but it was seeded from the
  invented fixture, so ungated it quietly re-supplies what the gate just removed.
- **A `useState` initialiser** — a snapshot of revocable data: correct when
  written, frozen the moment the source is withdrawn. §6aj in React shape.
- **A count.** The tab bar's unread badge promised six messages after every screen
  was clean. **A badge is a reader too.**
- **A DISABLED CONTROL is a reader too** (Session 05, decision 19). A greyed compose
  button reads as "not built yet" — but the capability was not unbuilt, it was RULED
  OUT, and the obvious way to finish a disabled control is to wire it up, hit the
  RLS denial, and request the grant that breaks the rule. When a ruling lands, ask
  which greyed affordances now promise something the platform has decided against.
  Remove them with the reason written where the control was, so nobody restores it
  as a kindness — and record which disabled controls are merely unbuilt (those may
  legitimately return) versus forbidden. The two look identical on screen.

And fail closed while the session is UNKNOWN: "we don't yet know whose app this
is" is not honestly answered with six invented clients.

**The count failure also arrives from the opposite direction** (Session 01, the
Home unread badge): a badge derived from a properly-gated list looks finished — but
the REAL side mapped every thread `unread: 0`, hardcoded, because nothing tracked
read state yet. Both halves zero, so the figure was right for months **without ever
being exercised**: the day read-tracking lands, it under-reports real messages
while a DEV build still counts invented ones. **A figure that is correct only
because every input is currently zero has not been verified — it has been
unexercised.** And the merge beside it — `[...real, ...invented]` — is correct
today only because one array is empty: displacement written as concatenation is not
a bug yet, which is precisely why it will not look like one to whoever reads it
next. Log these BEFORE the capability lands (their `PH-28`), so the audit is ready
rather than remembered.
Session 05's fixes are the pattern:

- **A real session DISPLACES the sample entirely — never merges.** A screen mixing a
  real account with invented figures is one where no individual number can be
  trusted, and the demo banner cannot say which half it covers.
- **One claim, one source** (§6ai's rule): the credential mark renders only from the
  server's derived state once a session exists.
- **An UNREADABLE state never earns a mark — a claim made by a timeout is still a
  claim.**



## 6ak. A CITATION IS ONLY AS GOOD AS ITS REPRODUCTION

**2026-08-31, the calorie fix.** The fixed per-activity MET was replaced with the
ACSM metabolic equations, applied per position sample (averaging pace first
flattens the hills back out and hands back the constant the change was meant to
remove). Measured against the owner's complaint: one hour at 10 km/h, 72 kg — old
code, 720 kcal flat OR climbing; new, 758 flat and 1,066 on a 10% grade. The
figure now moves with effort, which is what "inaccurate" meant.

**The rule, from Session 01:** citing a published basis is worth nothing unless the
implementation reproduces it. An equation with one coefficient transcribed into the
wrong slot still looks authoritative — **worse than the constant it replaced,
because now it carries a citation.** So the repo holds seven published compendium
values as a fixture, and the model must reproduce all seven (±1.2 MET). The old
`metEstimate` was never checkable against anything; this is. **When adopting a
published formula, commit reference values FROM THE PUBLICATION beside it, and test
reproduction, not plausibility.**

Satellites of the same rule, all shipped as tested behaviour rather than comment
assertions (§6ah):
- **Do not borrow an equation's authority outside its fitted domain** — cycling
  does not use running equations; indoor keeps a fixed MET because a treadmill has
  no GPS to integrate, and that is the best honest figure, not a null pretending
  the session did not happen.
- **Gaps are not costed.** Sample intervals over 30 s are skipped: costing a
  backgrounded span at the pace of the sample that ended it invents the energy of
  everything in between — the classic way an activity returns from a tunnel with a
  personal best attached.
- **Standing still returns null, never zero** — and descent never costs nothing or
  less; spikes are clamped.



## 6al. VERIFICATION EVIDENCE EXPIRES WHEN REACHABILITY CHANGES

**2026-08-31, the web auth gate.** Session 02's earlier bundle check proved four
gated strings at "0 files" in a production build — true, because Rollup dropped the
whole `/app` chunk behind `import.meta.env.DEV`. Moving the gate from DEV to a real
session made ~30 screens reachable in production for the first time, **and the old
evidence did not transfer: it described a build in which the code did not exist.**

Re-running the check found a live violation the gate had been hiding: `Coach.tsx`
rendered its credits chip unconditionally and swapped only the number — so the
first real signed-in climber would have read **"Coach credits · — available"**, a
metered balance nothing in the codebase defines, in the bare-dash form the doctrine
bans by name. Harmless for months, wrong the day the gate moved, no edit in between.

**The rule: a verification result is a fact about the build it ran against, not
about the code.** When a gate moves, a flag unties, a route mounts, or a chunk
starts shipping, every check that depended on unreachability is void and must be
re-run. Corollary of §6r (a guard written against a fixture stops guarding when the
source changes) and sibling of §6aj (the hazard is what silently keeps doing the
old thing) — here, what kept doing the old thing was the EVIDENCE.

Practice that followed: screens written under "this only runs in dev with demo data
present" get a dedicated audit against a production build with the arrays empty,
scheduled as its own job — never assumed covered by the feature work that moved the
gate. And a gate whose safety rests on a coupling ("IS_DEMO is DEV") carries a
tripwire comment naming the coupling and the grep that detects its break.



## 6am. A MODEL'S FAILURE MODE IS GENEROSITY — HAND IT A CLOSED WORLD

**2026-08-31, the coach's trek suggestions (PH-14b).** The naive build is a prompt
line: "suggest treks near the athlete's objective." A model so instructed will
produce real-sounding treks ICEFALL does not hold — **it fails by being helpful,
not by being wrong on purpose** — and every invented itinerary carries the app's
authority.

The shipped architecture inverts it: **retrieval first, instruction second.** Code
searches the real records and hands the model the shortlist as data with a
closed-world rule — *these are the ONLY treks you may suggest or name.* The
scripted (offline) coach answers from the SAME retrieval, so the two coaches
cannot suggest different worlds.

Satellites:
- **The basis word is chosen by CODE, not the model.** "Linked to Mont Blanc
  itself" vs "in the same country as Aconcagua" — the honesty of "near" is decided
  where it can be tested.
- **No third band.** Mountain-linked, then same-country — a "nearby" that has
  drifted to a continent is not near, and padding dilutes the bands that mean
  something. An empty result says so: the catalogue holds no Greek trek, and the
  coach says exactly that rather than stretching.
- **Judgement is explicitly left open** — "whether one suits where your training
  is right now is a conversation, not a list." Retrieval bounds the nouns; it must
  not fake the verdict.

And the confession that belongs beside it: ten minutes after recording §6aa's
lesson, its author wrote the trek-question regex twice — caught only on re-read,
now one exported pattern. **Knowing the shape does not stop the hand; only the
re-read does.** The constitution prevents nothing by being read once; it works by
being the thing you check your own diff against.


## 6f. A SYNC SCRIPT'S CORRECTNESS IS NOT OBSERVABLE FROM THE FILE IT COPIES FROM

`icefall-web` was never in `icefall-shared`'s sync list. Its `src/money/model.ts`
was a 25 Aug copy `npm run sync` had never touched — the script listed app,
guide, admin, crm and operator, and not web. So the web tree carried a superseded
pricing model for as long as the omission lasted.

**Nothing about `money.ts` looked wrong.** The only symptom was a consumer that
*failed to break* when it should have: after syncing the new model, `icefall-web`
typechecked clean, and it should not have. Session 03 caught it by noticing the
absence of an expected failure — a genuinely hard signal to see.

> **Any fan-out mechanism must be verified at the leaves, because the source
> cannot tell you who is not listening.**

The list of consumers is itself an asset that drifts, and it drifts silently:
adding a consumer is a change to the *script*, and nothing in the file being
copied records who should receive it.

### And the amendment that makes it useful — Session 03's

The line above explains why the drift was *invisible*. It does not say the more
important thing, which is that **finding a defect tells you nothing about its
impact**:

> **Verify the blast radius separately from the defect. The mechanism and the
> consequence are two findings, and being right about one is not evidence about
> the other.**

Session 03 established the mechanism and reported a consequence as though it
followed — "stale money model" → "wrong price shown" → "public surface", three
plausible hops and not one verification step. See §6b, instance 3.

---

## 6j. A BOUNDARY ASSEMBLED FROM INDEPENDENT CHECKS FAILS WHERE THEY MEET

The 2026-08-29 security sweep's one HIGH finding — a company could overwrite a
competitor's live listing through the approval engine — was NOT a missing check.
Session 03's own diagnosis, which is the lesson:

> *"Every individual guard worked. `company_id` was gated, the field whitelist
> held, the overlap guard held. What was missing is that nothing connected the
> two operator-supplied columns TO EACH OTHER. A boundary assembled from
> independent checks has a gap exactly where they meet, and no reviewer looking
> at any single check would see it."*

`content_versions` took two operator-supplied columns — `company_id` (gated by
the insert policy) and `entity_id` (a bare uuid). Each was individually
constrained. Nothing verified that the entity being edited belonged to the
company filing the edit, so a valid-looking row pointed one at the other's data.

> **When more than one field is attacker-controlled, the vulnerability is
> usually in the RELATIONSHIP between them, not in any one field.** Audit the
> joins between trusted inputs, not only the inputs.

And the fix belongs at the moment of the write, not only at submission: a pending
version can outlive an ownership transfer or a change to the validator itself, so
`approve_content_version` re-checks ownership before applying — approval is when
the write happens, so it is when being sure matters.

## 6c. THE HONESTY DOCTRINE APPLIES TO CODE, NOT ONLY TO SCREENS

Session 02 was asked to add `listing_view` instrumentation to `icefall-web`. It
refused, and the reasoning is now a standing principle:

> **Instrumentation that exists and cannot fire reads, to the next person, as
> instrumentation that works.**

In `icefall-web` the emit points are unreachable twice over — the `/app/*` chunk
is dropped from any production build, and in DEV every company is a demo company,
which the request's own first caution forbids emitting for. So the set of events
it could ever produce is empty by construction.

The failure mode is the marketplace-side twin of the one the doctrine already
guards against on screen: an operator's Performance tile shows a real number,
someone checks that both consumer surfaces emit the event, sees the calls in the
web tree, and concludes the figure covers web traffic. It never did. The tile
under-reports from a silent, invisible cause — **a number that looks measured and
is partly fabricated by omission.**

> **A half-wired pipeline is worse than an unwired one, because only the unwired
> one is legible.**

`viewsReading()` returning `Unavailable` is the honest state, and it is the same
code path as the working metric.

**The general rule:** do not land code whose only property is that it never runs.
If a hook must be placed early, the call site must say out loud that it is inert
and name the condition that would make it live.

**Structural vs provisioning gates — the distinction that decides "not yet" from
"never".** Both consumer apps turned out unable to emit `listing_view`, but for
different reasons, and the difference changes the answer:

- **`icefall-web`'s gates are STRUCTURAL.** The `/app` chunk is dropped from the
  artefact by design and the brief forbids simplifying that; every company in the
  tree is a demo company by definition. No amount of waiting changes either.
  Correct answer: do not place the call. *Timing is not the argument.*
- **`icefall-app`'s gates are PROVISIONING.** `supabase` is `null` because no
  project exists, and there is no company-shaped record to attribute a view to
  because operators are `sample: true` listings. Both lift on a specific future
  event. Correct answer: wire it **in the same change that provisions the
  backend** — genuinely "not yet", not "never".

**And gate the emit on the record, not on an environment flag** — the
`RealBusiness.tsx` pattern. A check against a real `Company` record is
*structurally* incapable of firing for a sample listing or a demo operator; an
env flag is only a promise that someone set it correctly.

**Corollary on "it is only one line":** `icefall-web` has no Supabase client at
all — none in `src/`, none in `package.json`. Adding a database client, its
config, its env keys and a client-side write path to a shared table is not one
line, and the write-permission question on that table belongs to Session 03.
Check what a "one-line" ask actually requires in the tree being asked.

---

## 6d. A METRIC AN INTERESTED PARTY CAN WRITE IS NOT A MEASUREMENT

Session 04 went looking for whether a company could forge its own view count —
the anon key ships in the bundle, so a client-written row is authored by whoever
is looking at the page. The number in question sits on the screen an operator
uses to justify renewing a paid placement.

Session 03 had already closed the schema half: `analytics_events.source` is
`client` | `server`, and the insert policy is
`with check (source = 'client' or is_staff())`, so a signed-in client cannot
claim a server row. **Session 04's own reader had not.** `viewsReading()` counted
every `listing_view` regardless of source — the honest empty state was written,
and the door left open behind it.

Fixed, and the three-state handling is the part to copy:

| Rows present | What the screen says |
|---|---|
| trusted (`server`) | the measured number |
| only `client` | *"views are being recorded but not yet from a source ICEFALL can verify, so there is no figure here you should make a commercial decision on"* |
| none | not counted yet |

Neither easy falsehood: not "not counting yet" (false once rows exist), not a
number (forgeable).

**The rule:** a figure shown to a party who benefits from it must come from a
source that party cannot write. Ask *who authored this row* before showing a
count to the person it flatters.

### The consequence, and who owns it

**A client emit from `icefall-app` alone will NOT light that tile**, and that is
correct behaviour, not a bug to route around. The operator-facing figure needs a
trusted emitter — an edge function or server route writing with the service role.

**Owner: Session 03**, as the backend owner. **Priority: low** — Session 04's own
scoping is right, it blocks one number on one screen and nothing is broken
without it, because the unavailable state is honest and is the same code path as
the working metric.

**It must NOT be worked around by loosening the insert policy.** That policy is
the only thing standing between a paid-placement renewal decision and a number
the company being sold to can write itself.

---

## 6e. GATING A FIXTURE IS NOT DONE UNTIL EVERY READER OF IT GOES THROUGH THE GATE

**This class bit three times in one day.** Summits and achievements were gated in
`AppState` — and the career totals in `feed.ts` were not. Then the level and XP
were not. Then the onboarding dedupe was not.

The worst instance, found by Session 01 by *looking at a first run* rather than
reasoning about it: a production install carried three fixture objectives as the
athlete's own active goals — Mont Blanc, the Matterhorn, Everest — with training
"started eleven weeks ago", 62% prepared, and a gap list making direct claims
("one rotation of three completed", "crevasse rescue refresher outstanding").

**Why it outranked every other honesty defect:** `usePrimaryGoal` sorts by
soonest target date, not by preferring the athlete's own. So an athlete who named
an objective further out than the fixture's Mont Blanc had **the fixture's
mountain promoted over their own** — and Home, the Coach, the kit checklist, the
elevation-band conditions and the benchmark all orient on the primary goal. The
entire app pointed at a mountain the athlete never chose and told them they were
twelve weeks into training for it. That is *"the training app that knows your
specific mountain"* inverted.

**And gating it created a second bug that nearly shipped.** `completeOnboarding`
deduped the athlete's named objective against the raw `GOALS` import. Once the
fixture went DEV-only, a production athlete typing "Mont Blanc", "Matterhorn" or
"Everest" would match a fixture goal no longer in their list — so no objective
would be created, and they would finish onboarding with none, having just named
one. Caught by grepping every reader of the fixture after gating it. **Not by
testing.**

> **The rule: after gating a fixture, grep every reader of it and check each one
> individually.** A gate at the definition does not travel to a second import
> site, a dedupe, an aggregate, or a sort key. The bug it leaves behind is
> *worse* than the ungated fixture, because it only appears in production.

### A green suite is not coverage — Session 03's rule

A guide commission rule was storable but unresolvable: `commission_rules.scope`
accepted `'guide'`, while `resolve_commission_rule` matched only product, company
and default and took no guide argument at all. So **every** guide commission
failed with "no guide commission rule is configured", however carefully one had
been set up. Found by Session 03 auditing its own eight migrations rather than
waiting for it to surface.

> **"A test suite that covers one branch of a two-branch engine reports full
> health. So: for every branch a function can take, ask what proves the OTHER
> one runs. The tests were green the entire time the guide path was dead."**
> — Session 03

The second sentence is the operative one. Session 03: *"I wrote the referral
tests first, they passed, and I never asked what covered `kind='guide'` — the
green was the thing that stopped me looking."*

The suite was green throughout, because it only ever exercised the referral path.
Now covered: a guide-scoped rule resolves; a guide rule outranks a company rule;
a referral rule cannot capture a guide booking; and *"changing a guide's rate
does not rewrite what they already earned"* — the same freeze test as the
referral stream, and the one that matters most, because a guide is a person whose
past earnings would otherwise silently restate.

**Ask which branches a green suite never enters** — especially where two streams
share one engine.

### A correction to the handbook's own known-issues list

§16.21 item 4 claims a first-time user "drops into five empty states". Session 01
verified both first-run paths in a production build with storage wiped: the empty
states are written, each carries an action, and it is a good screen. *"Whoever
wrote that item was working from the code, not from the screen."* Treat the
handbook's known-issues list as claims to check, not findings to inherit.

---

## 6h. A SAFETY MECHANISM CAN BE DESTROYED BY BEING MADE NOISY

Three times in one day a session refused to introduce a signal that would be
*correct* but *permanently unactionable*, on the grounds that it would train the
reader to stop reading:

- **Session 02** refused to declare a `video` section id before the block
  existed. A declared id with no element measures `not-found` on every pass,
  forever — and `not-found` is the one case defined as LOUD. *"Declaring it early
  would have trained me to ignore the exact signal the design depends on."*
  (Session 04, agreeing.)
- **Session 03** refused to let a verification document with no expiry date be
  reported as expired: *"'not recorded' and 'expired' are different statements,
  and a queue that conflates them is one staff learn to dismiss."*
- **Session 04** refused to show a view count built from client-written rows,
  where the honest third state was neither a number nor "not counting yet".

> **A false alarm does not merely misinform — it teaches people to stop reading.**
> A warning that fires when nothing is wrong is worse than no warning, because it
> destroys the one that fires when something is.

- **Session 03** shipped an alert reading *"297 mountains have no Premium
  partner"* — and removed it on sight. That is not an alert, **it is the
  catalogue**: it fires on the ordinary state of the business and would fire
  every day until 297 mountains were sold. It now counts only destinations that
  are actually selling, which is 0 today and correctly hidden.

The test before adding any alert, error state or loud case: **can the reader act
on it today?** If not, it is noise wearing a warning's clothes, however true it is.

## 6i. WHEN A DECISION CHANGES, THE HANDOFF FILES ENCODING THE OLD ONE ARE PART OF WHAT CHANGES

Session 02 had written *"video block: owner-approved, build it"* into a handoff
for the session that would replace it — an instruction that a later decision made
wrong. Had the restart landed an hour later, a fresh session with no memory of
the conversation would have read it and built a section nothing could fill.

Session 04's formulation:

> *"A wrong instruction sitting on disk, addressed to a session with no memory of
> the conversation that made it wrong, is worse than a wrong instruction in a
> live thread — nobody is left to argue with it."*

**A stale fact gets checked. A stale instruction gets executed.**

So: after any decision, sweep the documents that carry instructions derived from
the old one — handoffs, briefs, requests, this constitution. And write them so
the reader who stops early stops at the correct action: **instruction at the top,
history underneath**, never the reverse.

---

## 7. Standing operational rules

1. **Deploy only on an explicit go-ahead for that specific change.** `vercel
   --prod` from `icefall-app/` publishes immediately to a real linked project
   (`prj_PFpJmOfRquAiFaAQzsrwMxzdcfww`). The "auto-deploy without asking" note in
   memory applies to **Marketing Bible only** — never generalise it to ICEFALL.
2. **Never commit or push unless asked.** The family is now committed (`fc2ea16`)
   on branch `feat/ofm-workspace`, but committing *your* work is still the
   owner's call.
3. **Never run `npm run build` while a dev server is running** — it serves the
   app unstyled and only a dev-server restart fixes it.
4. **Never start a dev server with `npm run dev` from Bash.** Use the
   `preview_start` tool with the launch-config name. An orphaned process holds
   the port under `strictPort` and blocks the real launch.
5. **Never scrape third-party copyrighted images.** Photography comes from
   Wikimedia Commons with licence + attribution tracked in `CREDITS.md` files.
6. **Never run `railway variable list` unfiltered** — it prints every secret.
7. **`caffeinate -dimsu -t 5400` before any long agent run.** Long sweeps have
   died to Mac sleep twice, costing two full runs.

---

## 8. How work is judged

- **1:1 visual fidelity is the bar, not structural equivalence.** A Home pass
  that matched a mockup's structure but not its look was rejected as *"doesn't
  look 1:1 with the mockup."*
- **A palette swap is not a redesign.** After any style pass, also add or
  substantially rework at least one real section before calling it a redesign.
- **Things that look broken get rejected on sight.** A 13px spinner was rejected
  as looking broken and replaced with a 132px radar showing the real stage.
- **When a label does not fit its cell, shorten the label.** Never let it
  truncate.
- **Iconography gets redrawn, not recoloured.**
- **"Verified" means looked at in the browser.** There is no test suite in the
  front-end apps.

---

## 9. Verification

```bash
npx tsc --noEmit    # must be clean. This is the ENTIRE automated safety net for the front-ends.
```

Both `icefall-app` and `icefall-web` are currently clean — keep them that way.

```bash
cd icefall-shared   && npm test   # 58/58 — only if you touched money.ts
cd icefall-supabase && npm test   # 31/31 — only if you touched a policy
```

`noUnusedLocals` is **false**, so dead imports are not caught by the compiler.
Check them by eye.

There are **no tests at all** in `icefall-app`, `icefall-web`, `icefall-admin`
or `icefall-guide`. Adding them where you build new logic is welcome; retrofitting
the whole app is not your task unless asked.

---

## 10. Reference documents

| Path | What it is |
|---|---|
| `~/Downloads/ICEFALL-HANDBOOK.md` | 18,363 lines, 16 chapters. The master reference. Ch 02–16 = phone app, Ch 17 = web. |
| `~/Downloads/ICEFALL-review-brief.md` | The audit prompt — a good short orientation. |
| `~/Downloads/ICEFALL-ALL-PAGES-WORKSHEET.{pdf,xlsx,docx}` | 118-page inventory of every page in both apps. **Stale** — regenerate before use. |
| `~/Downloads/ICEFALL_OPERATOR_CRM_CLAUDE_CODE_SPEC.pdf` | Source of truth for Session 04. |
| `~/Downloads/ICEFALL_INTERNAL_BUSINESS_CRM_CLAUDE_CODE_SPEC.pdf` | Source of truth for Session 03. |
| `icefall-app/CONVERSATION_ARCHIVE.md` | Why the six folders exist; locked decisions. |

**After ANY ICEFALL work, update the handbook in the same turn.** §17.9 is the
handover list. A stale handbook is worse than none, because it is used to decide
what to build.

---

## 11. What the handbook now gets wrong (verified 2026-08-28)

- **It predates the azure rebrand.** Chapter 03 documents champagne gold
  throughout. `--ice-gold` does not exist.
- **"Nothing has ever been committed" is obsolete.** `fc2ea16` imported all six
  folders. Treks, notifications and 662 `icefall-web` files remain untracked.
- **Counts have moved:** 252 treks / 22 regions (not 124/13), 52 peaks (not 51),
  64 honesty constants (not 65), 3 migrations (not 2), 31 RLS tests (not 15),
  102 routes / 84 lazy in `App.tsx` (not 97/78).
- **Several documented bugs are already fixed** — the `--radius-pill` bug, the
  `DEMO_NOTICE` concatenation, the dead `TerrainMap` import, the
  photograph-under-plate-caption.

## 12. Honesty violations — status

**Updated 2026-08-28. Every `icefall-app` item below is now FIXED and
independently verified by the brain** (Session 01, verified by reading the files,
not by trusting the report). They are kept here as a record of what was wrong and
where, because §6b's lesson applies: the next reader should be able to see what
this codebase has already had to correct.

### Fixed — `icefall-app` (Session 01, 2026-08-28)

These are real, verified, and in a plain production build — not behind
`SHOW_DEMO_DATA`. Listed here so no session re-reports them as new:

| Violation | Location | Session |
|---|---|---|
| Fake `•••• 4242` Visa row | `icefall-app/src/screens/booking/Review.tsx:74` | 01 |
| Invented guide "Alex Martin", 4.9★, 127 reviews | `icefall-app/src/screens/booking/data.ts:23` | 01 |
| Fabricated verification date *"Documents checked by ICEFALL on 5 Jun 2026"* | `icefall-app/src/screens/booking/data.ts:38` | 01 |
| Profile career totals seeded from fixture (128 activities, 1,245 km, 6 summits) — re-opens a hole `AppState.tsx:558` deliberately closed | `icefall-app/src/tracking/feed.ts:119` | 01 |
| Nutrition renders fixture targets; `NUTRITION_DISCLAIMER` + `IMAGE_ANALYSIS_NOTE` sit unused | `icefall-app/src/screens/Nutrition.tsx` | 01 |
| Invented ★ ratings / review counts / prices, while the file header still claims to refuse them | `icefall-app/src/screens/Expeditions.tsx:813-840` | 01 |
| `ActivityHistory` never filters `simulated` from displayed totals | `icefall-app/src/screens/ActivityHistory.tsx` | 01 |
| Hardcoded `windKph: 0` rendered as "0 km/h" | `icefall-app/src/tracking/adapt.ts:91` | 01 |
| "24/7 Support" asserted for every operator including the real one — **59 of 69 commercial pages** | `icefall-web/src/app/TripDetail.tsx:335`, `Company.tsx:357` | 02 |
| ICEFALL's own refund policy printed as the operator's terms, unattributed — **59 pages** | `icefall-web` trip + company pages | 02 |
| An invented ★ rating and review count — **62 pages** | `icefall-web/src/data/demo.ts`, `companies.ts` | 02 |
| Scarcity, "N left" — **55 pages.** §1 bans scarcity outright, and `DashboardShell:169` states the opposing rule verbatim. Two contradictory stated rules; **escalated to the owner.** | `icefall-web/src/data/tripDetail.ts:507` | 02 |
| A ranking badge — "MOST POPULAR" / "BEST VALUE" — assigned **by array index, with no data behind it** — 59 pages. That is social proof, also banned by §1. **Escalated.** | `icefall-web/src/app/Company.tsx:38` | 02 |
| A summit success rate — 9 pages | `icefall-web/src/app/Company.tsx:356`, `GuideProfile.tsx:146` | 02 |
| **"summit-ready" on the PUBLIC waitlist** — the only page that actually ships. Adjacent to the banned "expedition ready" family. **Escalated.** | `icefall-web/src/screens/Waitlist.tsx:63` | 02 |
| A real US operator ("Alpine Ascents") in an invented message thread, as a bare string with no `Company` record, so the real-business guard cannot see it | `icefall-web/src/app/Home.tsx:83` | 02 |

**Attribution correction (2026-08-28):** of the four real company names in owner
decision #2, only **Elite Exped** appears in `icefall-web`. **Seven Summit Treks,
Adventure Consultants and 14 Peaks Expedition are Session 01's alone.**

**Copy, do not reinvent:** `icefall-web/src/components/RealBusiness.tsx` keys both
the banner and the demo notice off the `Company` record, so a page structurally
cannot render a real operator without the disclosure travelling with it. Its one
blind spot is a real name hardcoded as a bare string with no `Company` record.

**Launch blocker, not cleanup:** `icefall-app/src/services/trailImagery.ts:84`
documents that the keyless Esri World Imagery tier is non-commercial-only and
non-redistributable — and it is now the default base for ~99.5% of trail cards,
while Pro billing is already scaffolded in `growth/tiers.ts`. Needs a licensing
decision before billing goes live.
