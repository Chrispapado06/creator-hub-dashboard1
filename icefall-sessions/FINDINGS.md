# Cross-boundary findings

Something wrong outside your scope? Log it here and **do not fix it**. A
cross-boundary "quick fix" is how two sessions end up editing the same file in
the same minute.

Format: `- [owner-session] file:line — what is wrong. — found by NN, YYYY-MM-DD`

---

## Open

- **[owner decision needed] Signed-out visitors cannot read approved marketplace
  content.** The foundation migration gives `anon` nothing, deliberately, and the
  two CRM migrations keep that posture. But a public marketplace has to render
  approved company and product pages to people who have not signed in. The two
  options are a narrow `anon` SELECT limited to `status = 'live'` rows, or a
  server-side read with the service key. **Nothing is blocked today** —
  `icefall-web` is a waitlist page and `products` has no live rows outside seed
  data — so this is not urgent, but it is a decision rather than an oversight and
  it should be made before the marketplace goes public.
  — raised by 04 (schema request §7), logged by 03, 2026-08-28

- [01] `icefall-app` — **the phone-app half of the investor bug sweep is still
  open.** Session 02 completed the `icefall-web` half on 2026-08-28
  (`icefall-web/BUG-SWEEP-2026-08-28.md`). Before you run yours, read that
  report's Method section: a headless checker that waits on `networkidle` never
  settles on any page mounting maplibre, because the Esri basemap streams tiles
  for as long as the page is open. That — not sleep alone — is the likeliest
  reason this sweep has now died twice. Block off-localhost requests, settle on
  the app's own DOM. 348 web routes went from ~2 hours to ~9 minutes.
  — found by 02, 2026-08-28
- [01] `icefall-app` — owner decision #2 (replace real company names): of the
  four named, only **Elite Exped** appears in `icefall-web`. **Seven Summit
  Treks, Adventure Consultants and 14 Peaks Expedition are yours.** Also worth
  knowing: `icefall-web/src/components/RealBusiness.tsx` solves this well — the
  banner and the demo notice are both keyed off the `Company` record, so a page
  cannot render a real operator without the disclosure travelling with it. Worth
  copying rather than reinventing. Its one blind spot is a real name hardcoded as
  a plain string with no `Company` record — that is how "Alpine Ascents" got past
  it in the web app. — found by 02, 2026-08-28
- [owner/03] Licensing — the Esri non-commercial-tier blocker recorded in the
  constitution against `icefall-app/src/services/trailImagery.ts:84` **also
  applies to `icefall-web/src/app/mapTiles.ts:14`**, which uses the same keyless
  World Imagery endpoint as the basemap for every mountain and trek page. One
  licensing decision covers both apps. — found by 02, 2026-08-28

*(The violations already known as of 2026-08-28 are catalogued in
`00-CONSTITUTION.md` §11 — do not re-log those here.)*

- **[03] `icefall-shared/money.ts:423` — `DEFAULT_REFERRAL_PCT = 10` contradicts
  the 7.5% default referral in the CRM specs.** Two different defaults for the
  same operator-side stream. **Escalated to the product owner 2026-08-28 — do
  not pick a number until it comes back.** In the meantime Session 03 should
  build the commission engine rate-agnostic anyway (configurable, effective-dated,
  and the rate stored *on the commission record* so historical revenue is never
  rewritten) — then either value drops in without a migration.
  Note `SERVICE_FEE_PCT = 5` at `:197` is already correct and settled.
  — found by 04, escalated by brain

- **[all / lesson] A FIFTH commission model was found in `icefall-guide`, and it
  survived every previous sweep because it lived in a different app under a
  different name.** `icefall-guide/src/data/demo.ts` declared its own
  `COMMISSION_PCT = 12` and `Payouts.tsx` computed `Math.round((paid * 12) / 100)`
  from it — the wrong rate, the rounding pointed at ICEFALL where the shared model
  deliberately floors toward the guide, and charged on pass-through hut and lift
  costs against owner decision 13. **Fixed by Session 05 in its own tree**
  (deleted, not corrected to 10 — §6g: the rounding and the basis *are* the rule).
  Logged here for the generalisation, not the fix:

  > **The sync list is not the consumer list.** §6f says a fan-out mechanism must
  > be verified at the leaves because the source cannot tell you who is not
  > listening. This is the other half: `money.ts` reached `icefall-guide`
  > correctly and the app then **ignored it**. A consumer that receives the
  > canonical model and does not use it is invisible to any check on the sync
  > script, and invisible to a grep for the canonical constant's name.

  Session 01's reconciliation searched `icefall-app` for
  `PLATFORM_COMMISSION_PCT`/`GUIDE_COMMISSION_PCT`; nothing looked for a local
  constant called something else in a sibling tree. **Swept 2026-08-29 across all
  six trees** for local percentage constants and for raw `Math.round(x * n / 100)`
  money arithmetic: no sixth model exists. `icefall-app/src/guides/engagement.ts:74`
  is correctly an alias of the canonical constant. — found and fixed by 05

- **[unowned] `icefall-admin` is now the ONLY surface still on the retired
  champagne gold.** `icefall-guide` was swept to alpine azure on 2026-08-29
  (tokens and values renamed together, plus two hard-coded oklch triples of the
  old palette in `::selection` and the scrim gradients that a `grep gold` does not
  find). That leaves `icefall-admin/src/index.css:55`, whose `--adm-accent` is
  derived from the old accent at hue 76. Owner decision 4 says bring a gold
  surface across when you touch it — whoever picks up `icefall-admin` should.
  Separately, `--radius-pill` was declared on `:root` but never re-exported
  through `@theme inline` in `icefall-guide`, so `rounded-pill` compiled to
  nothing and three elements rendered square — the identical bug the athlete app
  already fixed. **Checked, do not re-investigate:** `icefall-admin`,
  `icefall-crm`, `icefall-operator` and `icefall-web` all re-export it correctly.
  `icefall-guide` was the last one. — found and fixed by 05, 2026-08-29

- **[brain/schema — SECURITY] `guide_profiles_write` lets any signed-in user make
  themselves a guide.** The policy is `for all to authenticated` with
  `with check (id = auth.uid() or is_admin())`
  (`20260817120000_icefall_foundation.sql:273`, re-issued unchanged at
  `20260829210000_rls_hoist_auth_uid.sql` — the later migration only hoists
  `auth.uid()` into a subquery and does not tighten the rule). So an athlete can
  `insert into guide_profiles (id) values (auth.uid())` and then set
  `listed = true` on it, because the same policy covers UPDATE.

  **Why it matters beyond misfiled tickets.** `open_support_ticket` decides the
  requester with `exists (select 1 from guide_profiles g where g.id = v_uid)`,
  so a self-inserted row is enough to be stamped `guide`. And
  `guide_profiles_select` permits `listed OR id = auth.uid()`, so a
  self-listed profile is readable by every authenticated user — the moment any
  surface renders a guide directory from this table, somebody nobody has checked
  appears in it as bookable.

  **VERIFIED BLAST RADIUS, separately from the defect (§6f).** The only live
  reader of `guide_profiles` anywhere in the family today is
  `icefall-guide/src/auth/account.ts:80`, the sign-in gate I added on
  2026-08-30. **No app renders a public guide directory from the database yet**,
  so nothing puts a fake guide in front of a climber today. What it does defeat
  is that gate — the guide app's own door, which exists to say "ICEFALL decides
  who is a guide".

  **What still holds:** `credentials_verified` keeps `check (= false)`, so a
  self-made guide cannot claim to have been checked, and
  `verificationSentence()` renders "Not checked by ICEFALL" without a review
  record. The badge is safe; the ROLE is not.

  **The constitution states this as an invariant and the database does not
  enforce it.** §6 decision 20 step 2: *"Signup always creates an `athlete`,
  never a higher role (foundation migration invariant)."* That is true of
  `profiles.role` — `profiles_insert_self` pins it — but `guide_profiles` is a
  separate table and nothing pins membership of it. Two statements, each true of
  its own table, and the guarantee people read from them is not held by either.

  Not fixed here: the schema is the brain's. Reported rather than worked around.
  — found by 05 (guide app), 2026-08-30

- **[01 / 02 / handbook] §6aa swept family-wide after the 10% → 15% change. The
  CODE IS CLEAN; five documents and comments are not.** Ran the check §6aa asks
  for across all five apps on 2026-08-31.

  **The reassuring half, verified rather than assumed:** no user-facing sentence
  anywhere states a stale rate. Both places that quote the figure to a person
  interpolate the constant — `GUIDE_FEE_DISCLOSURE` in `money.ts`, and
  `icefall-app/src/screens/guides/GuideDashboard.tsx:840`, which builds *"ICEFALL's
  ${PLATFORM_COMMISSION_PCT}% comes out of it, so you receive …"* from the alias.
  Both now read 15% with no edit. `icefall-web/src/screens/BookingConfirm.tsx:367`
  looked like rendered copy and is a JSX comment — checked, not assumed.

  **Stale, and each belongs to someone else:**
  - `icefall-app/src/guides/engagement.ts:48` — worked example *"The client pays
    €1,000. The guide receives €900. ICEFALL keeps €100."* — **Session 01**
  - `icefall-app/src/components/booking/parts.tsx:166` — *"ICEFALL's 10% is
    deducted from what…"* — **Session 01**
  - ~~`icefall-web/src/screens/BookingConfirm.tsx:367` — *"ICEFALL's 10% comes OUT
    of the guiding figure"*~~ — **Session 02 — DONE 2026-08-31.** Fixed by naming
    `GUIDE_COMMISSION_PCT` instead of restating its value, so it cannot go stale
    again. A number repeated in prose is a second copy of a fact that lives
    elsewhere, and it drifts exactly the way the four commission models did.
  - `~/Downloads/ICEFALL-HANDBOOK.md` §6 "The 2026-08-28 honesty sweep" lines
    ~15896–15935 — the €1,000 / €900 / €100 example three times, one of which
    quotes the guide-facing sentence verbatim — **Session 01's chapter**
  - `~/Downloads/ICEFALL-HANDBOOK.md` §17.9 handover list line ~18850 — *"a **10%
    commission DEDUCTED from the guide's fee**"* stated as the current model

  Not fixed: other sessions' apps and chapters (§5). **Chapter 20 is mine and is
  corrected** — including a live claim that named the rate, a historical example
  now labelled as historical, and a verification claim re-run at 15% (€2,400 with
  €310 passed on → €313.50 on the €2,090 fee, rule unchanged).

  **The pattern worth carrying:** every surviving stale figure is in prose, and
  every one that self-corrected was interpolated. The remedy is §6aa's — write
  the RULE beside the number. *"The commission is on the fee, never the total"*
  survives a rate change; *"€100"* does not.
  — found by 05 (guide app), 2026-08-31

## Resolved

- **[01/03] The gold → azure rebrand only ever reached `icefall-app`.** Verified
  2026-08-28: `icefall-guide/src/index.css:26` still defines `--ice-gold`
  (oklch hue 79.9), and `icefall-admin/src/index.css:55` derives `--adm-accent`
  (hue 76) from it. Only `icefall-app` was azure (hue 255.4).
  **Answered 2026-08-28: ONE accent across the whole family — alpine azure,
  hue 255.4 / `#4B9BFF` at full strength.** Staff and operator tools derive a
  darkened azure for legibility on a light background, exactly the way the admin
  tool currently derives a darkened gold. Nothing stays gold — bring any gold
  surface across when you touch it. `icefall-crm` is being built azure from the
  start, so it needs no sweep. Still outstanding and NOT resolved by this:
  Session 01's two gold-hex-under-azure-names files, and `icefall-guide` /
  `icefall-admin`, which remain unowned.
  — found by brain, decided by owner via brain, logged by 03

- [03] Port **5195** collided with the existing `cadence-crm` launch config;
  under `strictPort` one of the two would refuse to start. **Fixed 2026-08-28:
  `icefall-crm` moved to 5197**; `icefall-operator` keeps 5196. Constitution,
  brief 03 and README updated. The collision was the brain's error — good catch.
  — found by 04, fixed by brain

- **[all] The four session worktrees were cut from a branch with no ICEFALL in
  it.** Every `claude/*` worktree sits at `d29fa5b`, which is not a descendant of
  `fc2ea16` (the ICEFALL import), so none of them contained a single `icefall-*`
  folder: 01 and 02 had nothing to edit, and 04 could not create anything its
  siblings would ever see. **RESOLVED 2026-08-28 — all four sessions work in the
  MAIN CHECKOUT**, `~/Downloads/creator-hub-dashboard-main`, on branch
  `feat/ofm-workspace`. Worktree isolation is not a lesser option here, it is the
  wrong one: 03 and 04 are two interfaces onto ONE backend, and four isolated
  copies of the schema defeats the architecture outright. No merge, no commit,
  no recut — just build where the family already lives. Constitution §4 updated.
  — found by 04, resolved by brain

## Security + bug sweep — 2026-08-29 (7 confirmed, adversarially verified)

Six-lens adversarial sweep, every finding re-checked by an independent skeptic
(2 claims refuted). Ranked; all verified against exact lines.

### Owned by Session 03 (icefall-supabase / money) — relayed 2026-08-29
- **[HIGH/auth] Cross-company live-listing overwrite.** `content_versions.entity_id`
  is a bare uuid the insert policy never binds to `company_id`. A company admin can
  file a "pending edit" pointing at a COMPETITOR's live product; on routine Ops
  approval it overwrites the victim's listing, audit-logged as the attacker.
  `crm_marketplace.sql` insert policy :1151, validate :428, approve :592
  (+ `crm_mountain_video.sql:246`). Fix: bind entity_id→company_id in
  `content_versions_validate` and re-assert in `approve_content_version`.
- **[MED/money] Booking double-commissioned.** `record_commission`
  (`crm_commission_basis.sql:126`) never checks p_kind against `b.kind`; a guide
  booking can carry both a referral (7.5%) and a guide (10%) row.
- **[MED/money] Invoice creditable past 100%.** `issue_credit_note`
  (`crm_finance.sql:363`) caps each note but not the cumulative sum.
- **[MED/security] Paid-booking message gate never built.** `messages_insert`
  (`chat.sql:174`) still lacks the conjunct its own comment (:188-216) says is
  mandatory now that `bookings` exists. Pre-booking off-platform solicitation via API.
- **[LOW/money] `referralFee` rounds toward ICEFALL.** `money.ts:502` Math.round
  vs the file's own floor rule. Fix + `npm run sync`.

### UNOWNED — the owning session has ended, needs a new one or the owner
- **[MED/data-loss] Crash-safe recording can silently stop.** icefall-app:
  the in-progress persistence path serialises the FULL uncapped points array to one
  localStorage key every 3s; QuotaExceededError is swallowed by an empty catch
  (`activeSession.ts:34`). The FINISHED path caps at MAX_POINTS_STORED=900
  (`store.ts:22`); the live path does not (`recorder.ts:201/296`). A multi-hour
  expedition blows the ~5MB quota and stops snapshotting — the one case crash-safety
  exists for. Fix: cap the in-progress array the same way, or catch quota and drop
  oldest. **OWNER: was Session 01 (icefall-app), now gone.**
- ~~**[LOW/injection] Backslash URL bypasses the preview filter.**~~ icefall-web
  `previewProtocol.ts` — **DONE 2026-08-31, Session 02 (not gone; same session).**
  Reproduced first: `/\evil.com/x.gif` passed the old `startsWith("//")` guard and
  resolved to `http://evil.com/x.gif`, because browsers treat `\` as `/` when
  resolving. Fixed by parsing with `new URL(s, location.origin)` and judging the
  RESULT — https absolute, or same-origin — rather than pattern-matching the input,
  and by returning the parsed path so the trick is normalised away rather than one
  spelling refused. Verified across nine cases: the bypass, protocol-relative,
  http, `javascript:`, `data:` all rejected; app-relative, absolute https,
  same-origin http and query strings all still work.
  **The general lesson: a URL guard written as string prefixes is guessing at what
  a browser will do with the string. Ask the parser.**

### Refuted on verify (recorded so they are not re-raised)
- Events/Expeditions ungated scarcity counters — code claim TRUE but a plain
  disclaimer (`Events.tsx:23-27`) states the events and numbers are invented and
  controls are disabled, so nobody is misled. Build-hygiene nit, not deception.
- `LivePreview.tsx:145` misreads the `preview:rejected` shape — real, but the web
  side never emits that message on this path, so unreachable today.

### The displacement audit generalises past the screen you noticed (05 guide, 2026-08-31)
Fixing Home and Profile to respect the session felt like finishing the job. It
was not: **twelve more screens still read the invented data**, so the app told
the truth on one tab and contradicted itself on the next. The lesson is the
audit itself — when a capability lands (a session, a real rate, a server), the
question is not "which screen looks wrong" but **"who reads this now?"**, asked
against the full list of readers.

Three of the readers were ones no screen-by-screen sweep would catch:
- a `localStorage` store, because saved data looks like the user's own and
  therefore like the thing that should survive — but it was seeded from the
  sample and would have re-supplied it after the gate;
- a `useState` initialiser, which is a **snapshot of revocable data** — correct
  when written, frozen the moment the data may be withdrawn;
- a **tab-bar count**, still promising six unread messages after every screen was
  clean. A badge is a reader.

Worth other sessions' time: any app with seeded demo data and a login has this
shape. Gate at one point, fail closed while the session is unknown, and check
stores, initialisers and counts — not just screens.

---

## A focus indicator can pass every code check and still paint nothing

**Session 02, web, 2026-09-01. Applies to all five apps — every tree uses
Tailwind and a global `:focus-visible` rule.**

The controls contract says a replacement control must not regress keyboard
behaviour. Verifying that is where two plausible methods both lie.

**Grep lies in both directions.** A global `:focus-visible { outline: ... }`
in `@layer base` means a component with no focus classes is usually FINE, and
a component with `outline-none` is usually BROKEN — the opposite of what a
per-component grep suggests. Tailwind utilities beat the base layer, so
`outline-none` silently cancels the global rule for that element.

**Computed style lies worse, because it returns a PASS.** Three composers in
the web app reported, while focused: `outline-width: 2px`, `outline-color:
azure`, `:focus-visible = true`. Perfect on paper. They drew nothing —
`outline-style` was `none`, and an outline paints nothing at `style: none`
regardless of its width or colour. It never appeared in a before/after diff
either, because it was `none` in both states. **A style diff can report a
change that is invisible.**

**Only pixels are ground truth.** Screenshot the control blurred; Tab to it
for real; screenshot again; compare bytes. Identical bytes = the keyboard user
cannot see where they are. 394 controls across 22 pages took about four
minutes this way and found three real defects that both cheaper methods
cleared.

**Three rules for anyone re-running this:**

1. **Reach the control by Tab, never by clicking it.** A mouse click drops the
   browser out of keyboard modality, so `:focus-visible` correctly stops
   matching — and on a menu control the click also opens the menu. Both make a
   working control look broken.
2. **A shared element that fails on exactly one of the N pages it appears on
   is a measurement fault, not a defect.** A sidebar link failed 1-of-16 here;
   it sits below the fold and the screenshot clip fell outside the viewport.
   The ratio identified the probe as the fault before reading any source.
3. **`outline-none` is a promise to replace the indicator, never a way to
   remove it.** Pair it with `focus-visible:ring-*` on the control, or
   `focus-within:border-*` on the box the control visually lives in — which is
   usually the better answer, because the bordered pill or card IS what the eye
   reads as the control.
