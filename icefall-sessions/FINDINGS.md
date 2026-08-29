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
- **[LOW/injection] Backslash URL bypasses the preview filter.** icefall-web:
  `previewProtocol.ts:177` — a draft `gallery: ['/\\evil.com/x.gif']` is not
  `//`-prefixed so it passes the guard and resolves to `http://evil.com/...` in the
  dev preview. Fix: `new URL(s, location.origin)` and require same-origin. Dev-only
  today. **OWNER: was Session 02 (icefall-web), now gone.**

### Refuted on verify (recorded so they are not re-raised)
- Events/Expeditions ungated scarcity counters — code claim TRUE but a plain
  disclaimer (`Events.tsx:23-27`) states the events and numbers are invented and
  controls are disabled, so nobody is misled. Build-hygiene nit, not deception.
- `LivePreview.tsx:145` misreads the `preview:rejected` shape — real, but the web
  side never emits that message on this path, so unreachable today.
