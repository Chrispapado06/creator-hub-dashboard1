# What to build for Christos

**Date:** 6 Aug 2026 · **Scope doc:** 25pp ops memo (Luca) · **Repo:** `creator-hub-dashboard-main`
Every number marked ✅ below I pulled myself from the live production Supabase (`jzcnlxlorbmtgtjvgwbx`) today, read-only.

---

## 1. The honest headline

### Your scope does not fit. Not "is tight" — does not fit.

The 25 pages contain **73 recurring obligations totalling ~111 hours a week.** A real working week is ~45. That is **2.5x over**, before a single shoot, fire, or unplanned call.

| | hours/week |
|---|---|
| Daily-triggered obligations (p3 checklist, p8 quality areas, p25 posting) | ~74 |
| Weekly obligations (scripts, promo gate, focus decision, allocation) | ~22 |
| Event-driven, amortised (shoots, QC of arriving content, onboarding) | ~16 |
| **Implied total** | **~111** |
| **Available** | **~45** |
| **Gap** | **~66** |

No scheduling system closes a 66-hour gap. A calendar that shows you 111 hours of obligations in a 45-hour week is not a productivity tool, it is a guilt generator with a cron attached. So the first deliverable is not code. It is the arithmetic above, in front of Luca, with a name against every item you are not doing.

### But that is not your real problem either.

You asked "when do I review chatting, when do I post a story, when do I check Meta ads." That framing assumes the missing thing is a *schedule*. It isn't. Here is what the production database says about the task system you already own and already use:

- ✅ You have **153 task rows, 151 completed**. Sounds great.
- ✅ **17 of those 151 were completed on their due date. 11%.**
- ✅ You have completed a task on **8 distinct days out of the last 46**: Jun 22, Jun 25, Jun 28, Jul 25, Jul 30, Aug 3, Aug 5, Aug 6.
- ✅ **111 of the 151 completions (74%) happened in a single session on 25 July**, ending 27 consecutive days of zero completions. That is a bankruptcy clear, not a habit.
- ✅ Task generation ran **every single day** through that window (4–10 rows/day across the team, no gaps). The Discord digest — pinned, @-mentioning you, in your own channel `1518349289481310358` — was delivered daily and you acted on it 8 times in 46 days.
- ✅ You are in a honeymoon **right now** (3 completions Aug 5, 4 on Aug 6). The identical honeymoon ran Jun 22–28 and was followed by 27 days of silence. Do not read the next fortnight as evidence of anything.

**The delivery surface all three proposed designs wanted to build on is already deployed, already reliable, and already reaching you. The bottleneck was never scheduling, and it was never tapping a button. It is that a private list of obligations has never once, in 46 days, held your attention.**

There is a second reading — that you *do* the work and just don't tick the box. Entirely possible. But that reading is worse for a task system, not better: it means every button, snooze, strike and adherence percentage anyone proposed is dead weight and the correct build is smaller still. Both readings point the same way.

### The survival law in your own repo

Sort every system here by "does it need recurring human input?"

- **Zero human input → ALIVE:** shift-downtime-monitor (Railway, always-on), payout-bot (`*/10`), reddit-poll (`*/5`), reddit-watcher, daily-report, the digest cron itself, telegram-webhook edge function.
- **Needs recurring human input → DEAD:** taskflow-bot (never completed one `/done` cycle, token revoked, untracked in git), telegram-invoice-bot (Dockerfile written, never deployed), internal-promo-report (blocked on a manual xlsx conversion nobody did), keyword-tracker, drive-vault-bot (cron commented out), ad-tracker's Meta path.

Ten systems, and the split is **100% / 100%**. It is the strongest predictor available. Anything I recommend has to land on the alive side of that line, which means: **it must keep working while you ignore it.**

### One piece of hard evidence that delegation, not scheduling, is your actual failure

✅ `content_tracker` — the table driving your content pipeline — has **Rosario, Nicole and Antonella stuck at `stage='requested'` for five consecutive weeks** (week_start 6 Jul, 13 Jul, 20 Jul, 27 Jul, 3 Aug). The digest has been auto-nudging Gly every 4 days that entire time (`last_bumped` is being updated, so the nudge is firing). Five weeks of automated chasing, zero movement.

Your content chain is broken at step one, and it is broken *despite* already having the exact automation everyone wanted to build more of. That is not a cadence problem. That is a "Gly is not delivering and nobody has escalated it" problem, and the same automation that has been failing for five weeks will keep failing for five more.

### The three buckets

| Bucket | Count | Hours/wk | What happens to it |
|---|---|---|---|
| **AUTOMATE** — watch, never schedule | 26 obligations | ~53 → ~5 | Threshold alerts on exception only. Fire at the account's chatter first; reach you on the 2nd–3rd consecutive failure. Never on your list when everything is fine. |
| **DELEGATE** — "ensure X happened" | 18 obligations | ~18 → ~1 | Owned by Sophie / Finn / Gly / JA / Liz / Lance / QAs / JAR. Collapses to one "Waiting on" line, not 18 reminders. |
| **DO** — genuinely yours, named in the doc | ~14 obligations | ~31 | Captions (p21 #5 names you personally), scripts, Meta ads, external SFS, whale transfers, the weekly focus pick. |
| **DROP** — explicitly, in writing, to Luca | ~15 obligations | ~15 | See §5. |

31 hours of scheduled obligation + ~14 hours of unschedulable (shoots, external calls, fires, onboarding) = a full 45-hour week with zero slack. That is the honest ceiling, and it only works if all three of the other buckets actually happen.

---

## 2. The recommended design — **THE MORNING CARD**

One message. Once a day. Five lines. Never requires a tap. Nothing accumulates.

I am siding with the critiques against all three designs on their central bet. All three proposed **three pushes a day**. You currently receive **one** pinned, @-mentioning message a day and act on it 17% of the time. Tripling the frequency of a message with a 17% engagement rate is the worst move available. The second and third pushes will be muted before the first one is.

### What fires, and when

A single GitHub Actions workflow at **04:40 UTC** posts one message into your Discord channel, pins it, and unpins yesterday's.

**Why not the existing Vercel cron:** Hobby-plan crons are daily-only *and* best-effort within the hour — ✅ observed generation timestamps cluster at **08:21–08:58 UTC** against a `0 8 * * *` schedule. That puts the card at **11:20–12:00 your time**, after the morning it is supposed to organise. GitHub Actions at 04:40 lands it at **~07:45 Nicosia**, and — the reason that matters more — the same runner can reuse `payout-bot/daily.mjs`'s existing account functions to compute the money line for free, with no new persistence layer. This is the one place I disagree with the adoption critique's "no new cron", and that is precisely why.

**Your clock** (Manila has no DST, so this is stable year-round; Nicosia = UTC+3, London = UTC+1 today):

| | UTC | Nicosia | London |
|---|---|---|---|
| **Card lands** | 04:40 | **07:40** | 05:40 |
| Night block (Liz's) | 00:00–08:00 | 03:00–11:00 | 01:00–09:00 |
| **Day block opens** | 08:00 | **11:00** | 09:00 |
| **Evening block opens** | 16:00 | **19:00** | 17:00 |

Your working day covers the tail of the Night block, **all** of the Day block, and the Evening block opens exactly as you stop. The card gives you ~3 hours of runway before the block you supervise opens — which is exactly when MM approval (p8 #5) needs to be done, because it gates 8 hours of every chatter's programme.

> ⚠️ **Confirm your timezone before anything is seeded.** Your personal tooling defaults to `Europe/Nicosia`; every agency tool uses `Europe/London`. If it's London, the cron is `40 6 * * *` instead. Two hours of your day hang on this and no analysis could resolve it.

### What the card looks like

```
🗓️  Tue 12 Aug  ·  Day block opens 11:00

💷  Yesterday: $4,180 net (+12% vs 7d avg)
    Best: Blue Bear $1,290   Worst: June −38%   Whale spend: $1,760 / 9 fans

⛔  Approve Day-block MMs before 11:00 — 6 accounts submitted

📋  1. Scripts — personalise for ONE salary account (Tuesday block)
    2. Meta ads — read spend/CPA, make ONE change

👀  Checked clean: 8 accounts authed · 8 chatters assigned · queue depth
    · applicant SLA · content QC queue

🌙  Night block 03:00–11:00 is Liz's. Nothing from you.
```

Five lines. Hard cap: **1 gate + 2 items.** The cap is not a UI limit, it is the triage mechanism — item three is dropped for this card and re-competes tomorrow.

### The five design rules, and why each one

**1. Money first, list second.** The `💷` line is computed by code that already runs (`payout-bot/daily.mjs:52-70,135-147` pulls new/renew subs, day net sales, LTV and per-platform revenue for every account every morning — and throws all of it away). This is the only element in any proposal that **gives you something on a day you do nothing.** You open the card for the number you want; the two tasks are what you see on the way past. Design C identified this and then scheduled it for day 10. It goes first.

**2. No buttons in v1.** All three designs spend 20–40% of their build on a `Done` button. The thing that broke was never tapping — you cleared 111 tasks in one sitting when you wanted to. Opening the message is what breaks. A button does not fix that, and it is expensive here for a reason nobody flagged: ✅ the Discord bot (`supabase/functions/discord-bot/index.ts`) builds exactly one Supabase client from the auto-injected `SUPABASE_URL` of **whatever project it's deployed to** — and `whale_playbook` returns `PGRST205 Could not find the table` on the tasks project, proving it's deployed to `nyolewfgobbfroweaxtr`. `standalone_tasks` does not exist there. A `cad_done:` branch would fail every tap with a broken interaction, not a logged warning. It needs a second client, two new edge-function secrets, and a redeploy. That's a full day for an interaction you don't perform. **Deferred to Phase 2, conditional.**

**3. The system never requires a tap.** Items leave three ways: (a) **data closes them** — a re-auth clears when the account authenticates, a dry queue clears when posts are scheduled, a QC item clears when `content_tracker` advances; (b) **you do them and they expire**; (c) **they expire unactioned.** No adherence percentage, no streak, no overdue count. Those numbers cannot be produced by this system, deliberately.

**4. Nothing accumulates.** Every occurrence carries `expires_at`. Anything unactioned by the next card is written `status='done', resolution='expired'`. This is Design C's one genuinely brilliant idea: because it writes `status='done'`, expired rows vanish from **every existing query** in `src/lib/tasks.ts`, `src/routes/tasks.tsx` and `api/discord-digest.js` with zero downstream changes — the existing `CHECK (status IN ('open','done'))` never has to be widened. **Day 28's card is exactly as long as day 1's, with current data.** If a condition is still true tomorrow it re-raises, tagged "day 3". You never come back to a wall of 27-day-old accusations.

**5. Exactly two things never expire.** `hard_gate = true` on: **Monday salary pay** (p16 asks for this reminder verbatim — "It should also remind me if they need to be paid") and the **Thursday captions+edits deadline** for next week's promo schedule (derived: JA builds the schedule from your inputs, Liz/Lance approve Mon/Tue — so your deadline is Thursday, and it appears nowhere in the doc). Both block other people. Both escalate to Luca's channel at +24h with you @-mentioned. Those two are the only place in the system that shouts.

### Your literal Tuesday

**07:40** — Phone buzzes once. One pinned message, replacing yesterday's pin. You read the money line: $4,180, June down 38%. You read three more lines. **90 seconds.** Phone away.

**09:00–10:30** — Scripts for the newest salary account. Ninety protected minutes, because *nothing pings* and because Tuesday-is-scripts was decided by a rule, not by you at 09:00 on a Tuesday. This is the block that has not been happening.

**10:30–11:00** — MM approvals for the Day block. You read the six submitted batches, approve four, rewrite one caption on Antonella. Done before 11:00, so no chatter opens their block without a sending plan.

**11:00–13:00** — Call with Tom about external SFS swaps for Blue and Marissa. An editing fire. Lunch. Zero notifications.

**13:00–13:30** — Meta ads (Tue/Thu rule). Spend, CPA, ROAS per creator. You kill one fatigued creative on Nicole's set. One change, not a browse.

**13:30–18:30** — The rest of your day. The system is silent. This is the product: five hours in which you are not being managed by a queue.

**18:45–19:00** — Evening-block MM approvals, right before the block opens at 19:00. You do it because it was on this morning's card, not because anything pinged.

**19:00** — Closed. The Night block opens at 03:00 and belongs to Liz by name (`config.mjs:74`, the block's standing QA). A system that schedules you for 03:00 is a system that teaches you to ignore it.

**01:00** — The 23:00-London EOD posting report fires into the QA channel as it always has. Not your message. It becomes tomorrow's `👀` line.

**Wednesday 07:40** — Suppose you did none of Tuesday's items. **The card is the same length.** Tuesday's expired. Scripts re-raises tagged "2nd day". Meta ads re-raises. The MM gate does not, because the block is over and there is nothing to approve retroactively. There is no "3 overdue" anywhere, because that number cannot be produced.

**And if you ignore it for four days?** Nothing accumulates, nothing escalates except the two hard gates, and on day 4 with zero interaction the card halves its cap to one item and posts a single line: *"You haven't acted on a card in 4 days. Reply PAUSE to stop for a week."* It degrades quietly instead of screaming. If you come back on day 28, the card is five lines of current data — exactly what it was on day 1.

---

## 3. What it reuses vs what is new

### Reused — deployed, running, verified today

| Thing | Where | Status |
|---|---|---|
| Your Discord channel + @-mention | `chatters` id `06e819db-…f93`, name `Christofis`, `discord_channel_id 1518349289481310358` | ✅ live, active, `in_task_team=true` |
| `pinDaily()` — pin new, unpin bot's previous | `api/discord-digest.js:68-91` | ✅ deployed, handles both new `/messages/pins` and legacy `/pins` |
| `recurring_tasks` + `standalone_tasks` | migrations `20260613180000`, `20260613200000` | ✅ 15 rules / 319 tasks live |
| `generate_due_recurring_tasks()` | same migration | ✅ live, `FOR UPDATE SKIP LOCKED`, runs daily |
| Per-account money numbers | `payout-bot/daily.mjs:52-70,135-147` | ✅ computed daily at 08:07 UTC — **and discarded** |
| GH Actions cron pattern | `reddit-poll.yml` (`*/5`), `payout-bot.yml` (`*/10`) | ✅ proven, free, no new infra |
| `Public full access` RLS on every task table | `20260613200000:25-27` | ✅ publishable key has full CRUD — zero auth work needed |
| Guardrail signals already computed & thrown away | `monitor.mjs:715` (needs re-auth), `:739-748` (no chatter assigned), `of.mjs:183-186` via `monitor.mjs:499` (queue depth, only warns at literally zero, only at 23:00) | ✅ Railway, always-on |

### New — small

- **One migration** on `jzcnlxlorbmtgtjvgwbx`: 6 nullable columns + 1 partial index. No backfill, nothing breaks.
- **`cadence/cadence.mjs`** (~200 lines, plain Node 20 + fetch) + **`.github/workflows/cadence.yml`**.
- **One rewritten RPC body** — same name, same signature, same JSONB return, so both call sites (`src/lib/tasks.ts:363`, `api/discord-digest.js:167`) are untouched.
- **One line** in `api/discord-digest.js` skipping your uuid so you never get two lists.

### Written but never run — do not treat as infrastructure

| Thing | Reality |
|---|---|
| `taskflow-bot/` | Full Python bot with `/done`, `/mytasks`, weekday+time recurrence. **Untracked in git, Discord token revoked (401), never installed as a service, no confirmed end-to-end run, separate SQLite schema.** Read it as a spec. Running it forks your live data. |
| `telegram-invoice-bot/` | Dockerfile + compose written, never deployed, untracked. Good design reference for repeat-until-resolved. |
| `drive-vault-bot` | Cron **commented out** in its workflow, and its `DRIVE_MAP` covers Blue Bear, Meg, Emma, Marissa, Julie — **none of the three creators in `content_tracker`.** |
| `of_ppv_messages` | ✅ **0 rows.** Script-decay detection has no data, not partial data. |
| `creators` table | ✅ 9 rows — Bella Leah, Maylee, Emma Sonne, Meg, Johnnie, Blue Bear, Marissa Munoz, June, Antonella. **Contains neither Nicole nor Rosario**, the two salary creators the whole onboarding chain is about. Nothing writes creator rows automatically. |
| Railway state files | `Dockerfile` sets `STATE_DIR=/data` and comments *"see railway.json: mounts"* — ✅ **`shift-downtime-monitor/railway.json` does not exist in this repo.** The local copies of `lastspend.json` / `mm-eod.json` are frozen at **5 Jul** (a month stale). If no volume is attached in the Railway dashboard, every trailing baseline resets on redeploy. **Check this before designing any self-relative threshold.** |

### Three traps that will silently break the build

1. ✅ **`supabase db push` targets the wrong database.** `supabase/config.toml` line 1 is `project_id = "iziavsxxhnqmhfritkdp"` — a third ref matching nothing. `supabase/.temp/linked-project.json` says the CLI is linked to `nyolewfgobbfroweaxtr`. Your tasks DB is `jzcnlxlorbmtgtjvgwbx`. **Apply via the SQL editor.**
2. ✅ **There are two "Chris" rows.** `Chris` (`698a1f70-…`, `in_task_team=false`, discord ids are literally `"0"`) and `Christofis` (`06e819db-…`, fully wired). `api/discord-digest.js:224` does `name.toLowerCase().includes(needle)` over a name-ordered list — **`findId('chris')` returns the wrong row.** Hardcode `06e819db-1ec4-436c-b76e-1ff563e3ac93`.
3. ✅ **The recurring-rule UI cannot edit, pause, or reschedule anything.** `src/lib/tasks.ts` exports only `createRecurringTask` and `deleteRecurringTask` — no update, no pause. Seeding and retuning are SQL-only unless ~half a day of UI work is added.

**Small win nobody claimed:** `src/lib/tasks.ts:16-20` deliberately casts the Supabase client to `any` because "the generated types don't include the new tables yet." Adding columns breaks zero TypeScript and needs no `gen types` step.

---

## 4. Build plan

### Phase 0 — ship this week (2.5 days of code + 1 hour that matters more)

**Day 0 (half a day, verification only — each of these silently breaks the build if wrong)**
1. Confirm your timezone: `Europe/Nicosia` or `Europe/London`. Decides two hours of your day.
2. Open the Railway dashboard, confirm whether a volume is mounted at `/data` on `shift-downtime-monitor`. Decides whether Phase 1's whale triggers are possible at all.
3. Get a service-role key for `jzcnlxlorbmtgtjvgwbx`. (`npx supabase` works; there is no Docker on this machine, so there is no local DB and no local RPC testing.)

**Day 1 — migration + generator rewrite** (SQL editor, `jzcnlxlorbmtgtjvgwbx`)

```
ALTER TABLE public.recurring_tasks
  ADD COLUMN weekdays      smallint[],           -- ISO 1=Mon..7=Sun; NULL = interval_days as today
  ADD COLUMN hard_gate     boolean DEFAULT false,
  ADD COLUMN expires_hours integer DEFAULT 24;

ALTER TABLE public.standalone_tasks
  ADD COLUMN recurring_task_id uuid REFERENCES public.recurring_tasks(id) ON DELETE SET NULL,
  ADD COLUMN expires_at        timestamptz,
  ADD COLUMN resolution        text,             -- done_manual|auto_closed|expired
  ADD COLUMN source_key        text;

CREATE INDEX  idx_tasks_open_rule   ON public.standalone_tasks (recurring_task_id) WHERE status='open';
CREATE UNIQUE INDEX idx_tasks_srckey ON public.standalone_tasks (source_key)
  WHERE status='open' AND source_key IS NOT NULL;
```

Do **not** widen the `status` CHECK. Then rewrite `generate_due_recurring_tasks()` — same name, signature and return — with three changes inside the existing `WHILE` loop, keeping `FOR UPDATE SKIP LOCKED` and the `v_guard < 60` cap:
- **weekday skip** — `IF r.weekdays IS NULL OR EXTRACT(isodow FROM r.next_run)::smallint = ANY(r.weekdays)` (advance `next_run` either way, so no drift and no loop risk). Fixes: "every Monday" that currently drifts, weekdays-only, and `interval_days=30` pretending to be monthly.
- **dedupe** — skip the insert if an open row already exists for that `recurring_task_id`. One live instance per rule, ever.
- **stamp** `recurring_task_id` and `expires_at = now() + expires_hours`.

Also remove the browser-side `generateDueRecurringTasks()` call at `src/routes/tasks.tsx:84` — generation should be cron-only.

Verify by REST, not by local test: seed one throwaway rule with `next_run` 10 days back, POST the RPC, assert **exactly one** row and `next_run` landing tomorrow, delete it.

**Day 2 — `cadence/cadence.mjs` + `.github/workflows/cadence.yml`** (`cron: "40 4 * * *"`, structurally copied from `reddit-poll.yml`). It: reuses `payout-bot/daily.mjs`'s account/earnings functions for the money line; queries open tasks for you; renders 1 gate + 2 items + the `👀` line; posts, pins, unpins via `pinDaily()` lifted verbatim. Note `postToChannel` slices content to 1900 chars — budget for that. `DRY_RUN=1` prints without posting.

**Day 3 (half) — `expire_stale_tasks()`** run at the top of each card (writes `status='done', resolution='expired'` on anything past `expires_at` where `hard_gate` is not true), plus **the one-line skip** in `api/discord-digest.js` using the hardcoded uuid, plus **seed six rules** by SQL:

| Rule | Cadence | Why |
|---|---|---|
| Approve MMs before Day block opens | Mon–Fri, daily | Gates 8h of every chatter's programme (p8 #5) |
| Pay salaries · **hard gate** | Mondays | p16, requested by Luca verbatim |
| Captions + edited assets to JA · **hard gate** | Thursdays | Derived: blocks JA → blocks Liz/Lance Mon/Tue approval (p13) |
| Meta ads — one change, not a browse | Tue + Thu | p2 #3, first item on the p3 daily checklist |
| Scripts — one salary account | Tuesdays | p2 #8, p17 |
| Pick next week's focus: one chatter, one account, one team | Fridays | p7 #5 — the doc's own answer to overload |

Six. Not seventeen. You already have ✅ 8 active rules (three of them near-duplicate "Content Plan" variants) that you clear on 8 days out of 46; adding nine more to a pile you don't clear *is* the problem.

**Day 3, the hour that matters more than the other three days combined — the Luca document.** See §5. No code.

**Apply commands**

```bash
# Migration: paste 20260807120000_cadence_v0.sql into the SQL editor of
# https://supabase.com/dashboard/project/jzcnlxlorbmtgtjvgwbx/sql
# (NOT `supabase db push` — config.toml points at iziavsxxhnqmhfritkdp and the
#  CLI is linked to nyolewfgobbfroweaxtr. Neither is your tasks database.)

# Verify the columns landed:
curl -s "https://jzcnlxlorbmtgtjvgwbx.supabase.co/rest/v1/standalone_tasks?select=id,expires_at,resolution,recurring_task_id&limit=1" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY"

# Verify the RPC still returns its JSONB shape:
curl -s -X POST "https://jzcnlxlorbmtgtjvgwbx.supabase.co/rest/v1/rpc/generate_due_recurring_tasks" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" -d '{}'

# Vercel picks up the digest one-liner on `git push`. Smoke-test it:
curl -H "x-cron-secret: $CRON_SECRET" https://<app>.vercel.app/api/discord-digest

# New workflow: run once via Actions → cadence → Run workflow, with DRY_RUN=1.
# Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (jzcnlxlorbmtgtjvgwbx),
#                 DISCORD_BOT_TOKEN, CADENCE_CHANNEL_ID, CADENCE_OWNER_ID
```

### Phase 1 — only if you are still opening the card on day 14 (+3 days)

Three guardrail triggers, chosen because each needs **no baseline and no calibration** — every one is *absence of signal*, which is invisible today:

- **Scheduling queue below 8** — `countScheduledPosts()` already runs daily but only warns at literally zero, at 23:00, when nobody can act. Move it to the morning, raise the floor. Cheapest complete trigger in the repo.
- **Account needs re-auth** — computed at `monitor.mjs:715`, console-logged only. An unauthenticated account silently stops being monitored *and* stops producing every other signal.
- **No chatter assigned this shift** — the `∅` roster diagnostic at `monitor.mjs:739-748`. An account with nobody on it is an account nobody is answering.

Plus the **applicants SLA** (✅ 497 live rows, zero OF dependency) and the two `content_tracker` one-liners (add yourself to the QC and Monday-pay nudges — one line each, but expect nothing from them until someone advances a stage past `requested`).

Routing rule, and it is the single thing that keeps your card at 3 lines instead of 40: **first fire goes to the account's assigned chatter** via `resolveChatter()`. It reaches you only on the **second consecutive** failure, or when one account breaches across two different shifts. Your card contains "this didn't get fixed twice", never "this happened once".

Cost note: the Railway monitor's Supabase client points at the **whale** project, so writing tasks needs a second client and a new Railway env var. Half a day, and nobody flagged it.

### Phase 2 — conditional, do not schedule (+3 days)

Buttons, and only if there is evidence you *want* to interact. Requires the cross-project edge-function wiring above. When it happens: the branch goes **above** the `userIsManager()` gate — ✅ verified, that gate is literally the first statement of `handleButton` at `index.ts:1098` and would otherwise make the whole feature silently manager-only forever.

### Explicitly deferred, with reasons that are facts not preferences

Self-relative thresholds (no confirmed durable baseline until the Railway volume question is answered) · script decay (`of_ppv_messages` has 0 rows) · Drive-triggered QC (`DRIVE_MAP` covers none of the three tracked creators) · salary-onboarding auto-instantiation (`creators` has 9 rows and contains neither Nicole nor Rosario; nothing inserts creator rows) · a 73-row obligation register (nothing reads it in month one; a queryable index of 73 obligations *is* a 73-item to-do list) · adherence scoring, streaks, coverage percentages · any whale-transfer table (p21 #13 demands secrecy from the models, and every table here is `USING (true)` with the publishable key shipped in the browser bundle).

---

## 5. The delegation map

These should never reach you. Most of them already have an owner in the doc; what is missing is that the owner has no accountability loop and you are the silent backstop.

| Obligation (doc ref) | Owner | What reaches you instead |
|---|---|---|
| Shoot logistics, Airbnb, background assessment (p15) | **Sophie** | "Shoot booked / not booked" line. Not the booking. |
| Live filming direction (p16) — *"whether Christos or Sophie gives the direction depends on which makes the most sense"* | **Sophie** by default | You attend only when the account justifies it. Currently ~2h/shoot on you by default. |
| Week-1 salary pack (p15) — ⚠️ **BROKEN**, "the notion is not working anymore" | **Finn** | Chase line until an updated, versioned pack exists. This is blocking every creator onboarded right now. |
| Drive setup + creator content upload (p15) | **Glydel** | ⚠️ **Five weeks at `stage='requested'` with an automated nudge already firing.** Escalate to Luca, don't automate harder. |
| Build the weekly internal-promo schedule (p13) | **JA / VEL / admin** | Confirm it exists Thursday. Your job is the *inputs* (captions + edited assets), not the schedule. |
| Approve the promo schedule Mon/Tue (p13) | **Liz / Lance** | A missing approval timestamp becomes one line. This is the one cadence the org already accepts — model everything else on it. |
| Night-block MM approval, 03:00 your time (p8 #5) | **Liz** (Night QA, `config.mjs:74`) | Nothing. Structurally unservable from your timezone; delegated by name, not by discipline. |
| Evening-block QA (p8 #1/#2/#3) | **Lance** | Breach counts roll up weekly, not per-event. |
| Response times, PPV follow-ups, tone, cue-reading (p8 #1,#2,#3,#7,#8) | **the shift QAs** | You review one account's breach pattern weekly, not all eight daily. |
| Weekly chatter improvement session (p8 #19) | **the QAs**, you audit monthly | One line: "3 chatters have no improvement area logged this week." |
| Edits + destination treatments — blur, GIF cuts, FaceApp (p17) | **JAR + editing team** | Your final check on *return*, event-triggered, not scheduled. |
| Content QC on arrival (p16) | **you**, but event-fired | Fires when content lands. Unschedulable by definition. |

**Two hard truths about this map.**

First: ✅ **Sophie, Liz, Lance and JAR do not exist as `chatters` rows.** "Delegate" today means a Discord message from you, not a task in a system. Adding them is easy; getting them to use a dashboard they've never opened is the actual work — and note that Maya, Vel, Luca and Finlay are already flagged `in_task_team=true` and have **never had a single task** in the system's entire history. That is your empirical base rate for adding people to this thing.

Second: **the delegation map is a conversation with Luca, not a build.** The Gly evidence proves it. Five weeks of automated nudging produced zero movement. More automation aimed at the same person produces the same result.

### The document to send Luca (1 hour, no code, highest value in this brief)

p7 asks you, in capitals, to **"URGENTLY FLAG TO ME (LUCA) areas that aren't up to speed."** He has told you he cannot allocate resource to problems he isn't told about. So tell him:

1. **The arithmetic.** 111 hours implied, 45 available, 66-hour gap. Not a complaint — a scheduling fact.
2. **The drop list, by name, for him to accept or reassign** (~15 h/wk): chatter tone spot-checks (p8 #7) · aggressive-selling/cue spot-checks (p8 #8) · competitor market research + converting it into tests (p17–18) · welcome-message A/B tests (p18) · KYC-usage audit (p8 #16) · training-effectiveness review (p8 #18) · external-partner reciprocity check (p5) · emily/charlotte captions (p21 #4 — **and these two accounts appear in no roster anywhere in the repo; identity needs resolving before the task means anything**) · tease-content library rotation (p16, p21 #12) · story-batch rotation (p21 #7) · script niche-alignment audit (p8 #11) · identical-script audit across shared-fan accounts (p8 #12) · picture/teaser decisions per script (p18) · pricing tests toward the $25 target (p18) · the ramp-phase daily promo review (p13 — this was explicitly temporary and has no exit criterion; kill it, it's 2.3 h/wk forever).
3. **Three live blockers he can actually fix today:** Gly at `requested` for five weeks · Finn's week-1 pack dead ("the notion is not working anymore") · the response-time standard says 3 minutes (p8 #1) and the deployed monitor enforces 7 (`config.mjs:45-52`, "team request 2026-07-06"). Reconcile that in writing before anyone reports on compliance.
4. **Two sections of his own doc are unwritten:** p18 *"Things that need testing"* and p19 *"improvements to make"* are bare headings with nothing beneath them. Unbounded scope hiding behind two titles.
5. **Two accounts are under-protected right now:** `lillyylou` (Antonella) and `ellaajanee` (Ella) are hardcoded tier C in `config.mjs:24-25`, which means neither gets the 10-minute level-2 escalation — on two of the three accounts p25 singles out for attention. 30-minute fix, and it belongs in this conversation because it's a decision, not a bug.

### The intervention that is in none of the three designs, and is probably the most effective thing here

The doc already specifies a **standing daily working session with Luca** (p2, p3: *"Luca work with christos closely on this daily"*). That is a recurring external human prompt, it costs zero engineering, and **external prompting is the only mechanism in 46 days of data that has ever moved your completion rate.** Put the card's money line and its two items into that fifteen minutes instead of into a private queue.

If exactly one thing survives from this entire brief, make it the Luca document plus that fifteen minutes, with the money line as its agenda.

---

## 6. What this deliberately does not do — and the failure mode

### Does not do

- **No task engine.** You have one; it's live with 319 tasks and 64 pipelines. This is six nullable columns, one rewritten function, one cron.
- **No buttons, snooze, strikes, adherence %, streaks, or overdue counts.** Those numbers are the fuel of every task system that gets muted, and yours would read 11% on day one.
- **No web page.** No `/today` route. ✅ `public/sw.js` registers only `install`, `activate` and `fetch` — there is no `push` listener and no VAPID code anywhere in the repo, so the PWA **physically cannot** notify you. A page you have to remember to open is the exact problem.
- **No `ofm-workspace`.** Separate Supabase project, desktop-only, no task surface, no mobile client. Building there means building the task model twice.
- **No WhatsApp** (24-hour rule kills unprompted pushes; the WABA is restricted at identity level for this vertical) and **no reviving `taskflow-bot`**.
- **No three-times-a-day pushes.** One message, shorter than today's.
- **No qualitative judgement.** It will never tell you whether a caption is good, a banner is optimised, or a chatter read the cues right. Those stay a rotating manual audit — one account per weekday — and the system's only contribution is that the rotation happens. No LLM anywhere, consistent with the deliberate de-AI of shift-downtime, the digest, and ad-tracker.
- **No external-SFS delivery tracking.** Tom, huzz and Dan have no API; a partner who took your shoutout and never posted yours generates zero signal anywhere. Manual promised-vs-delivered register with a staleness nag, and honest about being manual.
- **No automation touching identity documents or payment credentials.** The p15 Skrill → Cosmo → Pagos247 chain involves proof-of-address and account security. The system tracks that the gate is open or closed. It never handles the documents.
- **No weekend cards, no 03:00 card.** Shifts run seven days; you don't. Weekend MM approval is uncovered and that is a real gap that belongs in the Luca conversation, not in a cron.
- **No attempt to make 111 hours fit into 45.** It makes the gap visible, dated, and attributable.

### The failure mode to watch

Not "he stops tapping" — ✅ you already don't tap, and the design assumes it. Three real ones, in order of likelihood:

**1. The card grows.** Week 5, Luca asks about the KYC audit. You add a rule. Then six more over a fortnight. The card goes from 5 lines to 14, the cap starts hiding things, and it quietly becomes the undifferentiated list it was built to replace. **Tripwire: rule count > 8, or card length > 6 lines.** Enforce the cap in the renderer, not by hoping.

**2. The money line stops being true.** One wrong or stale number and you stop trusting the whole card — and because the money line is the reason you open it, everything above and below it dies with it. This is why the `fetch_ok` flag matters: ✅ `monitor.mjs:404` wraps each per-account fetch in `try/catch` and `continue`s silently, so an API failure is *indistinguishable* from "posted nothing." On 5 Jul it recorded stories for 0 of 8 accounts. One false all-accounts alarm costs more trust than four weeks of correct ones earn. Never render a number you can't prove was fetched.

**3. The Luca conversation doesn't happen.** This is the one that actually kills it, and it kills it silently. If the scope isn't cut, the card is a five-line window onto a 111-hour obligation you cannot meet, and by week 4 you are adding rows to it out of guilt. Every proposal in front of you correctly identified that without the drop list the system is a guilt generator — and then all three scheduled that conversation for day 4, day 6, or week 7.

### How to judge it, honestly, at day 21 — not day 3

Two questions. Not completion rate, not taps.

1. **Did Luca accept or reassign the parked list, in writing?** If no, nothing built here matters. A cadence system cannot make 111 hours fit into 45; it can only put a timestamp on the failure.
2. **Is the card still five lines?**

And one caveat: ✅ you are three days into a honeymoon that is almost certainly an artifact of this analysis. The identical honeymoon ran 22–28 June and was followed by 27 days of silence. **Judge this at day 21, not at day 3.** If the answer to both questions is yes at day 21, build Phase 1. If either is no, stop — and put the fifteen minutes with Luca on the calendar instead.

---

# Part 2 — The actual cadence (seed data)

All times below are **Europe/London** — the agency clock (`REPORT_TZ`, the 23:00 EOD report, and the shift-block labels all use it). Today London is BST (UTC+1). **Manila = London +7.** Shift blocks resolve as: **Day** = PH 16–24 = London 09:00–17:00 · **Evening** = PH 00–08 = London 17:00–01:00 · **Night** = PH 08–16 = London 01:00–09:00.

⚠️ **Confirm before seeding:** his personal tooling (`telegram-invoice-bot/.env.example`) defaults `TZ=Europe/Nicosia`. If he is physically in Cyprus, **add 2 hours to every London time below**. The doc and the ops stack both run London; the two must be reconciled once, in writing, or every seeded `due_time` is wrong by 2h.

---

# A. THE DAILY CLOCK

Normal weekday. Owner column: **C** = Christos, everything else is a named delegate. "Auto-completes when" is the condition that ticks the row off without him touching it.

| Time | Task | Owner | Min | Trigger | Signal (if data-triggered) | Auto-completes when |
|---|---|---|---|---|---|---|
| **01:00** | Approve Night-block MM batches (8 accounts) + set per-account send-deadline slots | **Liz** (block QA) | 15 | event — chatter submits at/before PH 08:00 | accounts with no approved batch at block open | all 8 accounts have an approved batch. **Structurally unservable by Christos — do not assign it to him.** Raises an exception on his 09:25 sweep only if the block opened unapproved |
| **09:00** | Approve **Day-block** MM batches (8 accounts) + set per-account send-deadline slots | C | 15 | event — chatter submits at/before PH 16:00 | accounts with no approved batch at block open | all 8 approved. **Highest fan-out blocker he owns — 8 chatters stall behind it for 8 hours** (p8 #5) |
| 09:15 | Whale morning-touch **MISS list** — assign every miss to a named chatter | C | 10 | data | whale-list fan with **no creator-sent message since local midnight** (inverted check — a neglected whale emits no signal) | miss list empty, or every miss assigned to a named chatter (p8 #15) |
| 09:25 | Overnight exception sweep — Night + Evening blocks | C | 25 | data | (a) L1 downtime breaches grouped by account + chatter; (b) any account-shift with ≥3 MM gaps >90 min; (c) PPV-sent with no follow-up, PPV-unlocked with no aftercare; (d) chatters above the 7-min response threshold | every flagged account/chatter has a disposition: coach / ignore / escalate (p8 #1/#2/#3) |
| 09:50 | Meta Ads exception review | C | 15 | data | ad set spent >$50 with 0 attributed subs 2 days running · ad set spent **$0** today (delivery stopped/rejected) · CPA >1.5× its 14-day median | zero open ad exceptions. **Verify `META_TOKEN`/`META_AD_ACCT` are live first — the puller returns `{}` without them** (p3 item 1, p2 #2/#3) |
| 10:05 | Scheduling-queue floor check | C → admin | 10 | data | `countScheduledPosts` < **8** future posts on any account (~1 day of the intended cycle) | every account ≥8 queued. **Move this off the 23:00 EOD report — a zero-queue warning at 23:00 arrives when nobody can act** (p8 #20) |
| 10:15 | Content QC on arrival + rejection notes sent via **DeepL** | C | 35 | event — new files land in a creator Drive folder → `content_tracker.stage='received'` | drive-vault-bot 5-min poll (⚠️ its GitHub Actions cron is currently commented out) | every `received` row has pass/fail + written reason, and every fail is sent to Finn, Luca **and the model in her language** (p16, p17) |
| 10:50 | Final check on edited content returned from JAR / editing team | C | 20 | event — batch marked edited by JAR | — | every asset has a "better than raw" verdict. **GATE: `stage` must not reach `uploaded` without it, because Monday pay keys on `uploaded`** (p17) |
| 11:10 | Write **5 new captions** into the rotation batch | C | 20 | calendar | — | 5 new caption rows added today. **Assigned to him by name in the doc** (p21 #5) |
| 11:30 | Caption repeat audit | C | 10 | data | same normalised MM text sent ≥2× within 7 days on one account, **or** weekly distinct/total ratio <0.85 (measured: June-Sandra 16% dup, Antonella 9%, Julie 7%) | every flagged repeat replaced (p21 #5/#6, p12) |
| 11:40 | External SFS coordination — Tom / huzz / Dan | C | 30 | calendar — **execution, not oversight; no data precursor exists** | — | today's swap slots for **Blue, Marissa, Emma, Antonella, Ella** are booked in the swap register (p2 #1, p5) |
| 12:10 | *Buffer / lunch* | — | 50 | — | — | — |
| 13:00 | **Mid-day posting + promo checkpoint** — stories, feed gap, internal SFS links | C → chatter/admin | 25 | data | (a) today's story count < target × elapsed share of window, target = `max(trailing-14d median + 1, 3)` — **suppress if the day's story fetch failed**; (b) minutes since last feed post > 1.5× that account's trailing-14d median gap, 08:00–24:00 only; (c) tracking link with clicks in prior 7d and **0 today** | every behind account is back on pace or assigned, and every dead link has a disposition. **This slot does not exist today — the only posting report fires at 23:00, six hours after his day ends** (p21 #1, p23 #3, p25, p2 #5) |
| 13:25 | SFS **pre-publish** QA — both today's and tonight's queues | C | 30 | data | new SFS posts awaiting publish | zero published today with a wrong model, broken formatting, off-niche caption, low-quality image, or missing blur / GIF treatment (p23 #1, p20) |
| 13:55 | Major-whale oversight — the $3k+/month cohort | C | 20 | hybrid | 10 / 21 / 45-day silence bands from `lastspend.json`; month-on-month spend drop >50% | every $3k+ whale has a current context note and a named owner. ⚠️ **`recordSpend` stores only the date, not the amount — the real $3k/mo cohort can't be computed until amounts persist** (p2 #7, p8 #17) |
| 14:15 | Whale → salary **transfer chatting** — live 1:1 selling *(Mon/Wed/Fri only)* | C | 30 | calendar — **cannot delegate: p21 #13 requires the models not know** | — | a logged transfer, or a logged conversation per named target (p2 #6, p3) |
| 14:45 | Script verdict loop — read yesterday's PPV data, make **one** change | C | 20 | data — **exception-only, fires only when a verdict is due** | any script past **40 sends or 14 days live** with no verdict recorded | every verdict-due script carries CORE / ITERATE-price / ITERATE-content / KILL (see §E) |
| 15:05 | Applicant SLA sweep | C | 10 | data | `ai_verdict='pass'` AND `status='new'` AND age >48h · `status='messaged'` AND age >14d · zero passes in 7 days | every SLA-breached applicant actioned (p7 #1/#2) |
| 15:15 | **Daily Luca sync** — $50k EOM position + today's blockers | C + Luca | 30 | calendar | agenda auto-generated from the day's unresolved exceptions | today's flag list is sent to Luca. **The only standing daily sync in the doc, and it currently produces no artifact** (p2, p3, p7 closing "URGENTLY FLAGGING TO ME (LUCA)") |
| 15:45 | **Compliance sweep** — the two hard rules | C | 10 | data | (a) **any nudity-tagged media sent or priced under $100 on an 18yo-persona account** — must be **zero**; (b) >2 active unsent MMs on any account | day's sub-$100 nudity count = 0 **and** every account ≤2 unsent. ⚠️ (a) needs vault media tagged once; until then it runs as a manual spot-check of the day's sub-$100 PPV sends. **The only all-caps rule in the document and nothing currently checks it** (p8 #9, p8 #6) |
| 16:00–17:00 | *Weekly block lands here — see §B* | C | 60 | — | — | — |
| **17:00** | Approve **Evening-block** MM batches (8 accounts) — last action of his day | C | 15 | event — chatter submits at/before PH 00:00 | accounts with no approved batch at block open | all 8 approved (p8 #5) |
| 23:00 | EOD activity report posts (per-account MM / feed-post / story totals) | automated | 0 | calendar | — | no action — it is the input to tomorrow's 09:25 sweep |
| continuous | Downtime L1 (7m) / L2 (10m, A-B tier) / L3 (20m → Management) | automated → on-shift QA | 0 | data | fan message unanswered past threshold | resolved by the chatter. **Only the clustered 7-day roll-up reaches Christos.** ⚠️ The doc says 3 minutes (p8 #1); the live monitor enforces 7 (team request 2026-07-06). Reconcile once, in writing |

**Daily total for Christos: 6h 05m** (excluding the 16:00 weekly block). Everything account-level routes to the assigned chatter first via `resolveChatter()` and reaches him **only on the second or third consecutive failure, or when one account breaches across two different shifts** — i.e. when it is a system problem, not a person having a bad hour. That routing rule is what keeps this queue at 5–8 items instead of 40.

---

# B. THE WEEKLY CLOCK

Two fixed anchors drive every other placement: **Monday salary pay** (p16) and the **Mon/Tue promo-schedule approval** (p13). Working backwards from a Monday review, the schedule is built Fri/weekend, so **Christos's inputs are due Thursday** — a deadline that exists nowhere in the doc and is the single most likely silent weekly failure.

| Day / time | Task | Owner | Min | Trigger | Signal (if data-triggered) | Auto-completes when |
|---|---|---|---|---|---|---|
| **Mon 09:30** | **Salary payment run** | C | 45 | hybrid — Monday **and** "upon completing the content" | `content_tracker` last week `stage='uploaded'` AND `pay_status='unpaid'` | every eligible row is `paid` **and** every ineligible row has a written hold reason. **HARD GATE: no row pays without a final-check verdict** (p17) — otherwise p16's "if she isn't [filming right], we're paying for nothing" fires weekly. The doc asks for this reminder verbatim; the Monday half already runs but routes to **Luca only** — add Christos |
| Mon 10:15 | Salary pay reconciliation — rates, records, delivered-vs-paid diff | C | 30 | calendar | — | delivered-vs-paid diff is zero (p2) |
| Mon 11:00 | Confirm JA/admin's full week of internal promo slots is built, then hand to Liz/Lance | C | 30 | calendar | promo rows exist for all 7 days × all accounts | schedule marked submitted-for-approval (p13) |
| **Mon 11:30** | **Weekly focus decision — name ONE chatter, ONE team, ONE account** | C | 30 | calendar | — | 3 named targets written down, everything else explicitly on trust-the-system. **This is the doc's own answer to overload (p7 #5) and the meta-obligation that makes the other 72 survivable. If one row survives budget cuts, it is this one** |
| Mon 12:00 | Chatter load decision — how many accounts / how much traffic each is trusted with | C | 30 | calendar | — | next week's rota carries a per-chatter load judgement, not just availability (p8 #4) |
| **Mon 14:00** | **Weekly script-review ritual** (7-step agenda, §E) | C | 60 | calendar | — | every script in rotation carries a state with a this-week timestamp, and every verdict-due script has a decision |
| Mon 16:00 | Weekly referral push to all active chatters | C | 20 | calendar | — | every active chatter asked this week; referrals logged against the referrer (p7 #1) |
| **Tue 09:30** | Chase Liz/Lance approval of the promo schedule | C | 30 | data | **no approval timestamp by Tue 12:00** | approval timestamped before Wednesday. **This is the one recurring approval loop the org already accepts — model everything else on it** (p13) |
| Tue 11:00 | Media buying block — next week's creatives briefed, budgets set per creator | C | 90 | calendar | — | every active creator has a briefed creative + set budget with **one stated hypothesis per change** (p2 #2) |
| Tue 14:00 | Weekly chatter improvement session | C | 60 | calendar | — | every chatter has last week's area reviewed and **one new named area**. "Week on week" is the doc's own cadence (p8 #19); without it, p9's "1% better every day" has no mechanism |
| Tue 15:30 | MP scan for new salary talent | C | 30 | calendar | — | ≥3 candidates in the pipeline, or "none found" logged (p2, p3 — doc says daily; consolidated to 2×/week against a 3/month target) |
| Wed 09:30 | Market research — sub to new salary models + SEO-site creators, log captions / pictures / pricing / welcome flows | C | 45 | calendar | staleness nag: no new competitor observation in 14 days | ≥5 new competitor observations logged this week (p17, p18) |
| Wed 10:30 | Convert research into named tests now running on our accounts | C | 30 | calendar | — | ≥1 test created from this week's research. **Without this step the research is just browsing** (p18) |
| Wed 11:15 | Progressive-nudity price-anchoring review | C | 30 | calendar | first-nudity send price per chatter per account, vs the account anchor | every chatter systematically underselling first-nudity corrected with examples. Doc frames the damage as **permanent, not recoverable** (p8 #10) |
| Wed 14:00 | **Antonella** — picture QC + story quality | C | 30 | calendar | — | zero non-quality-passed pictures live; story count up week-on-week (p21 #2, p25) |
| Wed 14:30 | **Nicole** — content QC, confirm **all** of it is edited | C | 30 | calendar | — | nothing unedited live; story count up (p21 #3, p25) |
| Wed 15:00 | **Ella** — content QC, confirm **all** of it is edited | C | 30 | calendar | — | nothing unedited live; story count up (p25) |
| Wed 15:30 | **emily / charlotte** — captions in use | C | 20 | calendar | — | both accounts' captions reviewed, off-niche ones replaced. ⚠️ **Neither handle appears in any roster in the repo — first action is resolving which accounts these are** (p21 #4) |
| **Thu 09:30** | **INPUT GATE — captions + edited assets due for next week's promo schedule** | C | 60 | calendar — **derived deadline** | — | every slot scheduled for next week has an approved caption and an edit-passed asset. **Blocks JA/admin → which blocks Liz/Lance's Mon/Tue approval → which blocks the whole week's promo** (p21 #5 + p23 #4) |
| Thu 10:45 | Rotate the tease-content examples library; send fresh references to models | C | 45 | calendar | — | ≥5 new tease examples added to the Drive folder this week. Stale tease content is the doc's named cause of promo going "dry and repetitive" (p16, p21 #12) |
| Thu 11:45 | Rotate the story-asset batch so nothing repeats in-window | C | 45 | calendar | account's story batch depth <35 (5/day × 7d) | every account's batch ≥35. Without depth, hitting 5/day **forces** repeats — the exact spam signal p12 warns against (p21 #7) |
| Thu 14:00 | Promo slot reallocation toward the best-performing models | C | 60 | calendar | per-link subs + revenue per slot, last 7d vs prior 7d | next week's allocation written with who gained, who lost, and why (p21 #11) |
| Thu 15:00 | Salary-page slot utilisation check | C | 30 | data | scheduled slots vs capacity on salary pages | every salary page ≥90% of capacity, or the gap is quantified with a reason. **Unused owned inventory is pure waste** (p21 #10) |
| Thu 15:30 | Add daytime SFS slots — **Nicole and Ella specifically** | C | 20 | calendar, weekly **until resolved** | — | both accounts' daytime slot counts are up **and holding for 2 weeks**, then this row retires (p25) |
| **Fri 09:30** | **Final check on all edited content — before the Monday pay gate** | C | 45 | calendar — **derived; this is what stops the pay clock colliding with the QC chain** | — | every `content_tracker` row this week has a final-check verdict. **Unverdicted rows are BLOCKED from Monday pay** (p17) |
| **Fri 10:30** | **Maintain the MASTER LIST** — who gets more slots, who can run permanent feed-post SFS, who can't, what content/caption/model rotations apply | C | 45 | calendar | — | list carries a this-week timestamp and JA/admin can schedule from it unaided. **This artifact does not exist yet. It is the delegation unlock — until it exists Christos is in the loop for every scheduling decision** (p23 #2, p21 #9) |
| Fri 11:30 | Script / niche alignment audit — every active script vs its model's niche and converting factors | C | 45 | calendar | — | every active script has a niche-fit verdict (p8 #11) |
| Fri 13:30 | Duplicate-script audit across fan-sharing accounts | C | 30 | data | same or near-identical script text on two accounts with meaningful fan overlap | zero collisions. **This risk grows as internal promo scales** (p8 #12) |
| Fri 14:00 | External swap **reciprocity** check — promised vs delivered per partner | C | 30 | calendar — **derived; the doc never says to verify delivery** | register staleness: "partner X owes 2 slots for 9 days" | every promised slot has a delivered? tick; under-delivering partners flagged **before** more slots are given. External partners expose no API — one-sided delivery is invisible by default (p5) |
| Fri 14:30 | Hiring pipeline SLA review | C | 45 | data | candidate >14d in stage (warn) or >28d intake→onboarded (breach) | zero candidates past SLA, and enough in flight for 1–2 full teams monthly. **p7 #2 prices this: $100–200k/month of growth requires two teams consistently ready** |
| Fri 15:15 | KYC usage check — WHITEKNIGHT KYC + model KYC actually being used | C | 30 | calendar | — | KYC records populated **and referenced in live chats** on 3 sampled accounts (p8 #16) |
| Fri 15:45 | **Weekly flag-to-Luca sweep** — everything not up to speed, with severity + age | C | 20 | hybrid — weekly, plus immediately on discovery | any weak-area item unaddressed >14 days | standing weak-areas list sent, and every item ≥2 weeks old re-pinged. **Luca asks for this in caps: "URGENTLY FLAGGING TO ME (LUCA)"** (p7 closing) |
| Fri 16:05 | $3k+/month whale special-treatment audit | C | 30 | data | every fan spending $3k+ this month, vs evidence of above-and-beyond handling this week | every whale in the cohort has an identifiable non-standard touchpoint logged. **Highest revenue-per-hour obligation in the document — $36k+ per whale held for the stated year** (p8 #17) |
| Sat / Sun | *(nothing scheduled)* | — | 0 | — | — | Deliberately empty. The weekend is where a 2.5×-overloaded scope silently absorbs the overflow. If work lands here, the drop list below has failed |

**Weekly total: 21h 00m.** Combined with the daily clock: **51h 40m/week.**

---

# C. THE MONTHLY / PERIODIC LIST

| Cadence / when | Task | Owner | Min | Trigger | Signal (if data-triggered) | Auto-completes when |
|---|---|---|---|---|---|---|
| **One-off, do first** | Write the one-page **"what an optimised OF is"** definition — pictures, bio, niche, name, feed-post bar — that someone else can apply | C | 60 | calendar | — | the definition exists and another person passes an account against it unaided. **p21 #8 says it literally: "make sure chris knows what a optimised OF is"** |
| Rolling — 2 accounts/week, every account monthly (Fri 16:35) | **Account optimisation audit** — right pictures · bio correct · niche down · name done · feed posts better | C | 45/account | calendar | — | all 4 profile checks pass + feed-post bar met. Open named item: **rose needs an optimised banner** (p17, p21 #8, p20) |
| 1st working day of month | **Account tier review** — re-band every account A/B/C in `ACCOUNT_META` against last 30 days' revenue + traffic | C | 30 | data | account's 30-day revenue crossing a tier boundary | every account's tier matches its band. ⚠️ `tierFor()` **silently defaults an unknown username to tier C**, which removes the 10-minute escalation — a growing account loses cover without anyone noticing |
| 1st working day of month | **Training effectiveness review** — cohort performance vs the 70%-of-long-term-team bar | C | 60 | calendar | — | each training stage has a leak number and one change is made (p7 #2, p8 #18) |
| Last working day of month | **EOM close** — $50k generated + 3 salaries signed | C + Luca | 60 | calendar | — | both numbers recorded against target with a variance reason (p2). ⚠️ `interval_days` **cannot express month-end** — this rule will drift; seed it manually or add a `day_of_month` column |
| Every 2 weeks | **Whale KYC refresh** — re-verify WHITEKNIGHT + model KYC on the $3k+ cohort | C | 45 | data | KYC record age >30 days on a $3k+/month fan | zero stale records in the cohort (p8 #16/#17) |
| Every 2 weeks | **Niche test round** — pick 2 models, run an alternative niche framing on bio + captions + SFS for 14 days | C | 45 | calendar | — | each round has a written result and the winner is deployed. Doc: *"Our niching will need to be tested to see which niching performs better for different models"* (p17) |
| Every 4 weeks | **Welcome-message test cycle** — paid vs free, and with-picture vs without | C | 30 to set, 28d to read | calendar | — | both tests have a decision and the winner is deployed on **all** salary accounts. Highest-leverage single message on any account (p18) |
| Every 6 weeks | **Caption library full rotation** — retire every caption older than 6 weeks per account, replace from the research log | C | 60 | data | caption first-used date >42 days | zero captions in rotation older than 42 days (p12, p17) |
| Every 8 weeks, staggered one account per week | **Full script refresh cycle** per account (§E) | C | 120/account | calendar | — | the account's rotation is back to ≥6 CORE with nothing past the retirement bar |
| Quarterly | **Payment rail migration** — move salary creators off Skrill onto Cosmo or Pagos247 | C | 60 | data | creator still on Skrill >90 days | every creator past 90d is migrated or has a written exception. Doc: *"Skrill can be used at the start"*, *"Pagos is the safest"* (p15) |
| Quarterly | **Swap-partner portfolio review** — Tom / huzz / Dan: who actually delivers, add or replace | C | 60 | calendar | 90-day delivered/promised ratio per partner | each partner has a ratio and a keep/drop decision (p5) |

---

# D. EVENT-TRIGGERED CHAINS

These are **pipelines, not recurring tasks.** The repo's `task_templates` / `start_pipeline()` engine (sequential + parallel modes, auto-handoff pings) already models exactly this shape — instantiate on the event, don't put them on a calendar.

### D1. NEW SALARY SIGNED — target 3/month (p2, p15, p17)

| Offset | Step | Owner | Min | Gate |
|---|---|---|---|---|
| T+0h | Create creator row + `content_tracker` row + Drive folder request | C | 10 | — |
| T+4h | Google Drive set up **in Glydel**, linked to the master Drive; all old content uploaded | Glydel (C confirms) | 45 | **Blocks everything downstream — no library means no promo and no script references** |
| T+24h | Send the **week-one pack**: scripts + marketing content for the marketing list | Finn produces, C sends | 30 | ⚠️ **BROKEN TODAY — "the notion is not working anymore" (p15).** First action is chasing Finn for the updated pack; until it exists this step ships a stale pack. Record which version each creator received |
| T+48h | Filming logistics — Airbnb needed? can she film at her current address? **how does the background look?** | Sophie arranges, C confirms | 60 | Booking must land on a day she confirmed she is free. A booking on a wrong day wastes the Airbnb cost outright |
| T+72h | **Payment rail setup** — Skrill on our Lucambra email, email-only verification so she cannot log in or verify from her number; proof of address linked to her ID / a parent / a household member | C | 90 | **HARD GATE — must complete before her first Monday pay date.** An unverified rail at the moment payment falls due is exactly the collision that produces a missed first payment on a brand-new creator. *This step handles identity documents and account credentials — Christos performs it himself; it is not delegable to a tool or an automation* |
| T+5d | **Account build-out** — right pictures, bio correct, niche down, name done | C | 60 | **GATE: no promo slot may point at the account until this passes.** Traffic to an unoptimised page is 100% wasted |
| T+7d | **Personalise the proven script library to this model** — every script adjusted, none verbatim | C | 120 | p17: internally-promoted fans may see the same script elsewhere (p8 #12). This is not optional |
| T+10d | Book the first content shoot against the personalised script list | Sophie | 30 | — |
| T+14d | First promo slots go live | JA/admin | — | **auto-fires only when the T+5d and T+7d gates both pass** |

### D2. CONTENT SHOOT BOOKED

| Offset | Step | Owner | Min | Note |
|---|---|---|---|---|
| Shoot −7d | Scripts for this shoot **written and personalised** | C | 90 | **Longest-latency dependency in the operation.** Miss it and the loop costs a full content cycle, not a day — another Airbnb, another travel day, another payment |
| Shoot −5d | Content list finalised (scripts + tease content + weekly reels), sent to the model **via DeepL** | C | 30 | p16 |
| Shoot −3d | Tease-content references sent from the Drive examples folder | C | 20 | p16, p21 #12 |
| Shoot −1d | Confirm location, background, model availability | Sophie | 15 | — |
| Shoot day | **Live direction** — scripts correct, tease content correct, reels correct | C **or** Sophie (whichever makes most sense, p16) | 120 | *"If she isn't, we're paying for nothing, and the content won't perform the level it needs to."* Slip cost: catastrophic |
| Shoot +0 | Log the shoot as directed / not directed | C | 5 | — |
| Shoot +3d | **If no content received → raise "shoot was 3 days ago, nothing delivered"** | C | 10 | data-triggered. ⚠️ Requires a `shoots` table — none exists anywhere in the repo |

### D3. CONTENT ARRIVES (new files in a creator's Drive folder)

| Offset | Step | Owner | Min | Note |
|---|---|---|---|---|
| T+0 | Auto-advance `content_tracker.stage` → `received` | automated (drive-vault-bot, 5-min poll) | 0 | ⚠️ its GitHub Actions cron is **currently commented out** — re-enable it or this chain never starts |
| T+2h | **QC verdict** — pass/fail with a written reason | C | 30 | p16: *"as soon as it's sent in, it has to be quality-assured"* |
| T+2h *(fail)* | Flag to **Finn, Luca AND the model** with a concrete change list, translated via DeepL; set `stage='rejected'` | C | 15 | ⚠️ **`rejected` is not a valid stage value today** (`CHECK (stage IN ('requested','received','qc','uploaded'))`). Without it a stalled reshoot looks identical to a healthy pipeline |
| T+3h *(pass)* | **Destination-specific edit brief** — blur nipples/pussy and GIF cuts **for SFS only**; FaceApp young 2 / young 3 / teen + tattoo removal; Pretty Up for waist; AI for background and enhancing | C | 15 | p17. Feed posts do **not** get the blur/GIF treatment — briefing generically causes rework |
| T+4h | Forward to JAR + editing team | C | 5 | — |
| T+48h | Still `received` → escalate | automated | — | data-triggered |
| Edits return | **Final check** — is the model better than the raw? | C | 20 | **GATE: `stage` cannot reach `uploaded` without this verdict, and Monday pay keys on `uploaded`** |
| T+96h | Still `qc` → escalate to Luca | automated | — | data-triggered |

### D4. NEW SCRIPT FILMED
Entry point into the script lifecycle — see **§E**. Chain: FILMED → (D3 edit chain) → LOADED → TESTING (40 sends / 14 days) → verdict at the next Monday ritual.

### D5. ACCOUNT DROPS BELOW TARGET

**Trigger (data):** 3-day mean new subs < 50% of the trailing-14-day mean, **or** daily net sales < 50% of the trailing-14-day mean. Both numbers are already computed every morning by `payout-bot/daily.mjs` and then **discarded** — persisting two numbers per account per day is the entire build.

| Offset | Step | Owner | Min |
|---|---|---|---|
| T+0 | Raise "traffic/revenue down on {account}" | automated | 0 |
| T+2h | Diagnose which input moved — ads spend/CPA · SFS slot delivery · MM cadence · story/feed pace · script performance | C | 30 |
| T+1d | One named corrective change with a stated hypothesis | C | 30 |
| T+7d | Read the result; escalate to Luca if still below 50% | C | 20 |
| T+60d | **Keep-or-cut decision with Luca** if the account has been under **$10,000/month for 2 consecutive months** | C + Luca | 45 |

*p12 guarantees every managed account earns $10,000+/month — that is the escalation floor, not a target.*

### D6. WHALE GOES QUIET

| Band | Step | Owner | Min |
|---|---|---|---|
| **Day 10 silent** | Personalised **non-sexual** touchpoint from the model | assigned chatter | 10 |
| **Day 21 silent** | Christos reads the thread himself; chatter context check; KYC re-read | C | 20 |
| **Day 45 silent** | Recovery play — Christos writes the approach personally | C | 30 |
| **Any day** | $3k+/month whale whose spend drops >50% month-on-month → **immediate review, do not wait for a silence band** | C | 20 |

*Bands come from `lastspend.json` (3,896 fans, history from 2026-06-11 — no warm-up needed). Gate to whale-list members or this emits thousands of rows. ⚠️ `recordSpend` discards the transaction amount `listTransactions` already parsed, so until amounts persist the bands run off the whale list, not off the doc's actual $3k/month definition.*

### D7. NEW CHATTER STARTS TRIAL (p7 #2 — 2-to-4-week SLA)

| Offset | Step | Owner | Min |
|---|---|---|---|
| T+0 | Trial shift scheduled; account assignment decided (**how much traffic is this person trusted with**, p8 #4) | C | 15 |
| T+1d | Read their first full shift end-to-end against the 5 core components (p9): MM→conversation→script flow · aggressiveness + objection handling · aftercare · speaking as the model · dynamics | C | 45 |
| T+3d | Written verdict vs the **70%-of-long-term-team** bar | C | 20 |
| T+7d | Keep / cut decision | C | 15 |
| T+14d | If kept — onboarded onto real accounts with a **named load** | C | 20 |
| **T+28d** | **SLA BREACH if not onboarded** — the pipeline must run 2–4 weeks intake→onboarded | data-triggered | — |
| weekly thereafter | Enters the Tuesday improvement session with one named area | C | — |

### D8. MM BATCH SUBMITTED (per shift, 3×/day)

| Offset | Step | Owner | Min |
|---|---|---|---|
| T+0 | Chatter submits the batch **before login or at shift start** | chatter | — |
| Before block open | Review / approve / edit + set the per-account send-deadline slots | **C** (09:00 Day, 17:00 Evening) · **Liz** (01:00 Night) | 15 |
| Block open +20m | **UNAPPROVED → escalate.** The block has opened with no outbound plan | automated | — |
| Every 30–60m through the shift | Send cadence, policed by the MM-gap alert | chatter | — |
| Shift end | Unsent count ≤2 per account (p8 #6) | chatter | — |

*Calibration warning: 150 of 517 recorded MM intervals (29%) exceed 90 minutes. A raw 90-minute alert would fire ~37×/day. Alert on **≥3 gaps over 90 min in one account-shift**, or any single gap >3× that account's trailing median — never per event.*

---

# E. THE SCRIPT LIFECYCLE

### Definitions and the bar

A **script** = a sequenced sales sequence sold as PPV(s), filmed on a shoot, carrying a caption, pictures and teasers, tracked per account.

Two numbers from the doc set the bar:
- **$25 average revenue per script use** (p18) — the per-script target.
- **$5,000 pending per salary at bare minimum** (p18) — the account-level benchmark the whole salary model is priced off. Achievable at a $5 LTV with ~153 subs/day.

One hard constraint: **on internally-promoted accounts scripts must be personalised, never the proven library verbatim** (p17) — because internal swaps mean the same fan may see the same script on another account (p8 #12). A fan who sees the same script from two "different" models stops believing in all of them.

### Rotation depth per account — **8 to 12 live scripts**

The doc gives no number, so this is derived and should be ratified with Luca rather than treated as a quote. Reasoning: three shifts a day per account, a script attempt per shift, and a fan who must not see a repeat inside roughly two weeks. That needs:

- **6 CORE** — always in rotation, proven past the $25 bar.
- **2–4 TESTING / ITERATING** — live, gathering data.
- **A bench of RETIRED** — off rotation, but their best-performing pictures and teasers get cannibalised into the next draft.

**An account below 6 CORE is in deficit and commissions a new DRAFT that week.**

### The eight states

| State | Meaning |
|---|---|
| **DRAFT** | Written, not filmed |
| **FILMED** | Shot with live direction, awaiting edit |
| **LOADED** | Edited, pictures + teasers attached, priced, live on the account |
| **TESTING** | Live, gathering data — fixed window |
| **CORE** | Passed verdict, permanent rotation |
| **ITERATING** | Failed one dimension, **one** change in flight, re-testing |
| **TIRED** | Was CORE, performance decayed past the retirement bar |
| **RETIRED** | Off rotation; assets cannibalised into the next DRAFT |

### The test window

**Verdict is due at 40 sends on that account, OR 14 days live — whichever comes first.**

Why 40: enough to separate a 20% unlock rate from a 40% one. Why 14 days: fast enough that the loop closes weekly and the Monday ritual always has something to decide.

**If a script reaches 14 days with fewer than 40 sends, the verdict is "insufficient traffic — the problem is the account, not the script."** It routes to the traffic side (promo slots, MM cadence, ads) and does not count against the script.

### What decides — the verdict matrix

All three metrics come from `of_ppv_messages` (`price`, `recipients_count`, `unlocks_count`, `revenue`):

- **Primary — average revenue per send** = `revenue / recipients_count`. The $25 bar.
- **Secondary — unlock rate** = `unlocks_count / recipients_count`. This is the *diagnostic*: it tells you which lever to pull.
- **Tertiary — revenue per unlock**. Are we underpricing the ones who do buy?

| Result at window close | Verdict | Action |
|---|---|---|
| avg rev/send **≥ $25** | **CORE** | Into permanent rotation |
| avg rev/send **$15–25**, unlock rate **≥ account median** | **ITERATE — price** | They open it and don't buy enough. Test a **lower** price. p18 asks this directly: *"Does the pricing need to be tested to be lower to optimise for that $25 average use per script?"* A lower price × more unlocks can beat a higher price × fewer |
| avg rev/send **$15–25**, unlock rate **< account median** | **ITERATE — content** | They aren't opening it. **Add more pictures, add more teasers** (p18). The doc's stated mechanism: *"we need to have the touchpoints done with really good pictures of the model. That's what's going to get a guy to actually want to talk and spend"* |
| avg rev/send **< $15** after **one** iteration cycle | **KILL** | One iteration is the limit. Two failed cycles is where scripts go to rot |
| Caption doesn't play into the model's niche / converting factors | **PULL immediately** | Regardless of the numbers (p8 #11) |
| Script text also appears on an account sharing swapped fans | **PULL immediately, rewrite** | Regardless of the numbers (p8 #12) |

### When a tired script is retired

- **Performance:** a CORE script is **TIRED when its trailing-7-day avg rev/send falls below 70% of its own first-week rate, held 2 consecutive weeks.** Self-relative, not absolute — the same calibration rule that stops every doc target firing on every account.
- **Age:** **any script live >90 days goes to mandatory review even if the numbers hold.** Internal promo means the same fan population keeps seeing it — p12's anti-spam mechanism is literally *"constantly rotating pictures, captions, and stories."*
- **Retirement is not deletion.** Pull it, cannibalise its best-performing pictures and teasers into the next DRAFT, and log **why** it died so the next script doesn't repeat the mistake.

### When a new script gets written

**Scheduled floor:** 1 new DRAFT per account per 6 weeks. At 8–12 depth that refreshes the full rotation on roughly a yearly cycle with 2–3 always in test.

**Triggered, ahead of the floor:**
- Rotation depth on an account drops **below 6 CORE** → write immediately.
- **Two scripts hit TIRED in the same fortnight** on one account → write two.
- **A new salary account is optimised** → the whole personalisation pass (D1, T+7d, 120 min).
- **A shoot is booked** → scripts finalised at **Shoot −7d**.
- **Market research turns up a structure a competitor runs that we don't have** → p18, *"Adding it into our tests."*

**Writing is not the bottleneck — filming is.** So the calendar rule is: **write against the next shoot date, not against a fixed weekly slot.** A script that isn't written before the shoot cannot be filmed, and the cost of that miss is a full content cycle.

### Two standing tests alongside the loop (p18, named explicitly)

- **Paid welcome message vs free** — 4 weeks per account cohort, then decide and **deploy the winner on all salary accounts**.
- **Welcome message with picture vs without** — same window. The doc's prior is that the picture wins; run it to confirm and deploy, don't run it forever.

### The weekly script-review ritual — **Monday 14:00, 60 minutes, fixed agenda**

| Min | Step | Auto-completes when |
|---|---|---|
| 10 | **Verdicts due.** Every script that crossed 40 sends or 14 days since last Monday. Apply the matrix | no script leaves this step without a state |
| 10 | **Tired sweep.** Every CORE script below 70% of its first-week rate, plus everything past 90 days live. Mark TIRED, schedule the replacement DRAFT | every TIRED script has a replacement commissioned |
| 10 | **Depth check per account.** Count CORE + TESTING. Any account **below 6 CORE** gets a DRAFT commissioned and a shoot slot requested | every account ≥6 CORE, or has a DRAFT + shoot slot booked |
| 10 | **Iteration reads.** Did last week's price cut or added pictures/teasers move avg rev/send? **One change at a time, or the read is worthless** | every ITERATING script from last week has a re-verdict |
| 10 | **Cross-account duplicate check** (p8 #12). Any script text on two accounts that share swapped fans → pull and rewrite. Weekly, not monthly — the risk grows as internal promo scales | zero collisions |
| 5 | **Niche alignment spot-check** (p8 #11) on the 2 accounts in this week's rotation | both accounts have a niche-fit verdict |
| 5 | **Write the week's script decisions into the master list** so JA/admin and the chatters know what's live, what's testing, what's dead | master list carries a this-week timestamp |

**Ritual auto-completes when** every script in every account's rotation carries a state with a this-week timestamp, and every verdict-due script has a recorded decision.

### Data plumbing this lifecycle needs (all three are missing today)

1. **`of_ppv_messages` only fills when a human opens the dashboard and clicks.** The pull exists (`GET {acct}/messages?type=ppv&limit=100`) but no cron writes it. Needs a daily cron **on Railway**, not Vercel — the OF key is IP-allowed there.
2. **There is no `script_id`.** PPV rows can only be grouped back to a script by matching the `preview` text. Add a `scripts` table + `script_id` on `of_ppv_messages`, or the entire lifecycle runs on string matching.
3. **Mass-PPV is rare** — only 5 of 549 recorded mass messages carried a price. The **per-fan PPV endpoint is the real source**, not the mass-messaging overview.

---

# What this costs, and what is NOT on this page

**Total: 51h 40m/week** (daily 6h05 × 5 = 30h25, plus weekly 21h15) against a ~45-hour week. The extraction found **~111 h/week** of obligations as written. The 60-hour gap was closed by three moves, and the residual 6 hours must be closed by a decision, not by working harder:

**Deleted by routing (≈32 h/wk):** every account-level posting, MM-cadence, story, feed-gap and whale-touch check now fires at the **assigned chatter** first via `resolveChatter()` and reaches Christos **only on the second or third consecutive failure, or when one account breaches across two shifts.** He supervises exceptions, not schedules.

**Deleted by delegation (≈9 h/wk):** the **01:00 Night-block MM approval** is Liz's, permanently — it is structurally unservable from London. Shoot logistics stay with Sophie, Drive setup with Glydel, the week-one pack with Finn, the schedule build with JA/admin, edits with JAR.

**Deleted by consolidation (≈13 h/wk):** the 3×/week tone and cue-reading spot-checks collapse into one Tuesday 40-minute read; MP scanning moves from daily to 2×/week; SFS pre-publish QA runs as one queue instead of two; the account optimisation audit rotates 2 accounts/week instead of sweeping all accounts daily.

**Still 6h over — the three rows to reassign or drop, in the order I'd cut them:**
1. **Wed 14:00–15:50, the per-account QC blocks for Antonella / Nicole / Ella (1h50).** This is picture-and-edit checking. It is the most delegable hour on the page and it is the largest single block that does not require Christos's judgement specifically.
2. **Tue 11:00 media buying (1h30).** Named as area #2 in his scope, but it is the one obligation on this page that a dedicated media buyer would own outright.
3. **Fri 14:30 hiring pipeline SLA review (45m) + Tue 15:30 MP scan (30m).** Both are pipeline hygiene that an SLA alert can raise and someone else can chase.

**Two sections of the source doc are literally unwritten** — p18 ends on the bare heading "Things that need testing" and p19 is "improvements to make", both with no content. That is unbounded additional scope. **Flag it to Luca before committing to any capacity number.**

---

# Tooling gaps that make the "auto-completes when" column real

The delivery pipe already exists — `api/discord-digest.js` runs daily, materialises recurring tasks, posts each person's list into their own Discord channel and pins it, replacing yesterday's pin. **Do not build a new task engine.** Six additive changes turn it into this cadence system:

| # | Change | Why it's load-bearing here |
|---|---|---|
| 1 | **`due_time TIME` + `tz TEXT`** on `recurring_tasks` and `standalone_tasks` | The entire stack is DATE-granular. Without this, all 24 daily rows above land in one 09:00 dump — the same undifferentiated load he already carries, just displayed on a screen |
| 2 | **Collapse missed occurrences to one "overdue since X" row** | `generate_due_recurring_tasks()` inserts one row **per missed day** (cap 60). One skipped day on a daily rule becomes permanent visual debt, and the digest gets muted within two weeks. **This is a correctness requirement, not polish** |
| 3 | **Snooze / defer** — a third button beside Done | Status is `CHECK (status IN ('open','done'))`. There is no "not today". A 3×-daily cadence with no defer becomes noise he ignores inside a week |
| 4 | **`source_key TEXT` + partial UNIQUE on `status='open'`** | There is no dedupe constraint. A monitor loop running every 4 minutes would raise the same task hundreds of times. **Ship this before the first data-trigger or the queue self-destructs on day one** |
| 5 | **`weekdays` / `day_of_month` anchor** on `recurring_tasks` | `interval_days` cannot express "every Monday" reliably, "Mon and Tue", weekdays-only, or month-end. Monday salary pay, the Mon/Tue promo review and the EOM close all fall outside what the schema can safely hold |
| 6 | **`recurring_task_id` FK** on `standalone_tasks` + **`creator_id`** on `recurring_tasks` | The first unlocks adherence ("you posted stories 4 of the last 7 days") — the feedback loop that makes a cadence stick rather than rot. The second turns one rule into N per-creator tasks automatically, which matters because most of this list is "do X for each girl" |

**Plus three prerequisites before any data-triggered row can fire:**
- **A durable metric series.** `state.json` self-purges at 24h and `mm-eod.json` keeps 4 days, so no "vs its own trailing median" threshold has anything to compare against. One thin append-only table `(account, date, metric, value)` written by the monitor's existing EOD pass and by `payout-bot/daily.mjs` — which already computes every number and discards it.
- **A `fetch_ok` flag per account per endpoint.** On 2026-07-05 the recorder logged stories for **0 of 8 accounts** while feed posts recorded normally — an API failure is currently indistinguishable from "posted nothing". The mid-day story trigger would fire 8 false tasks the first time `/stories` 500s. ~5 lines, and it is a hard prerequisite.
- **Confirm Christos has an active `chatters` row with `discord_channel_id` set.** The digest silently skips anyone with neither a channel nor a user id. His `chatters` row exists and is wired — re-verify before seeding, because if it isn't, the whole cadence delivers to nobody.

**Hosting:** the once-daily morning list can stay on the Vercel cron (move it from `0 8 * * *` to `0 5 * * *` so it lands at 06:00 London / 08:00 Nicosia rather than after the morning is gone). **Everything with a time of day — the 13:00 checkpoint, the 17:00 Evening approval, the mid-day gap alerts — must run on the always-on Railway monitor**, which already has timezone-aware once-a-day gates. Vercel Hobby permits daily crons only. And do not let both post the same list, or he gets doubles — the `shift-downtime-monitor.yml` schedule is already disabled for exactly that reason.
