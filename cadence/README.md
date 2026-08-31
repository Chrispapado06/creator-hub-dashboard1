# The Morning Card

One Discord message a day at **04:40 UTC = 07:40 Cyprus**, pinned, replacing
yesterday's. Money first, then at most 2 hard gates and 2 items. No buttons,
nothing accumulates, no overdue count.

The design rationale is in [`../CHRISTOS_OPERATING_CADENCE.md`](../CHRISTOS_OPERATING_CADENCE.md).
The short version: a private list of obligations has never held attention for
more than a few days at a time, so this one leads with a number worth opening
for, caps itself at three lines of work, and expires everything you ignore
instead of stacking it into a wall of guilt.

## Files

| | |
|---|---|
| `cadence.mjs` | Builds and posts the card |
| `../.github/workflows/cadence.yml` | The 04:40 UTC cron + manual dry-run trigger |
| `../supabase/migrations/20260807120000_cadence_v0.sql` | Schema, generator rewrite, expiry, the six seeded rules |

## What it changes in the existing system

- `generate_due_recurring_tasks()` keeps its name, signature and JSONB return
  shape, so `api/discord-digest.js:317` and `src/lib/tasks.ts` are untouched.
  Three behaviours change: weekly rules stop drifting off their weekday, a rule
  never back-fills a pile of missed occurrences, and each occurrence records the
  rule that spawned it plus when it dies.
- Expired occurrences are written `status='done', resolution='expired'`. That
  keeps them out of every existing query without widening the `status` CHECK.
- `src/routes/tasks.tsx` no longer materialises on page open — generation is
  cron-only, so a rule can't advance mid-day after the card was rendered.
- `api/discord-digest.js` skips the cadence owner (env `CADENCE_OWNER_ID`), so
  he gets one push a day, not two. The card carries his pipeline steps in a
  roll-up line so nothing is lost. Unset the var and he rejoins the digest.

## Setup

**1. Apply the migration.** `supabase db push` is *wrong* here — `config.toml`
points at a different project than the one holding the task tables. Paste
`supabase/migrations/20260807120000_cadence_v0.sql` into the SQL editor of the
project that owns `standalone_tasks`, then verify:

```sql
select title, weekdays, hard_gate, expires_hours, next_run from public.recurring_tasks where created_by = 'cadence-v0' order by title;
```

Six rows expected. **Zero rows means the `like '%chris%'` assignee lookup matched
nobody** — fix the name and re-run; the rest of the migration is idempotent.

**2. Add the GitHub secrets** (Settings → Secrets and variables → Actions):
`CADENCE_SUPABASE_URL`, `CADENCE_SUPABASE_SERVICE_ROLE_KEY`, `ONLYFANSAPI_KEY`,
`CADENCE_CHANNEL_ID`, `CADENCE_OWNER_ID`, and **at least one transport**.

Discord ids and webhook URLs stay in Secrets, never in the repo. A webhook URL
is a bearer credential — anyone holding it can post to that channel.

**Transports, bot preferred:**

| | `DISCORD_BOT_TOKEN` + `CADENCE_CHANNEL_ID` | `CADENCE_WEBHOOK_URL` |
|---|---|---|
| Post | ✅ | ✅ |
| Pin, unpin yesterday's | ✅ | ❌ — webhooks can't hold Manage Messages |
| Needs the bot in the channel | ✅ | ❌ |

Set both and the bot is used, with the webhook as the fallback if the bot post
fails (missing channel access is the usual cause). Webhook-only works fine —
you just lose the pin, so the channel accumulates cards instead of showing one.

**Owner:** `CADENCE_OWNER_ID` (Discord user id) is matched against
`chatters.discord_user_id`; leave it unset and the owner is resolved from
`CADENCE_CHANNEL_ID` via `chatters.discord_channel_id` instead. If neither
matches a row, the card still posts with the money line and the checks, plus an
explicit ⚠️ line saying the task list is *unavailable, not empty* — an empty
list that reads as "nothing to do" is the worse failure.

**3. Dry-run it before it can post anything** — Actions → *Morning card* → Run
workflow, leaving "dry run" checked. It prints the card to the job log and
posts nothing.

**4. Set `CADENCE_CHANNEL_ID` in Vercel too** so the 08:00 digest stops
double-posting to you. It skips on either id.

Locally, without touching Discord:

```bash
cd cadence && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CADENCE_CHANNEL_ID=... ONLYFANSAPI_KEY=... DRY_RUN=1 node cadence.mjs
```

The bot needs **Manage Messages** in the channel or pinning silently no-ops
(everything else still works).

## The six seeded rules

| Rule | Days | Gate |
|---|---|---|
| Approve Day-block MMs before 11:00 | Mon–Fri | no |
| Pay salaries | Mon | **yes** |
| Captions + edited assets to JA | Thu | **yes** |
| Meta ads — one change, don't browse | Tue, Thu | no |
| Scripts — personalise one salary account | Tue | no |
| Pick next week's focus | Fri | no |

Six, not seventeen. There are already 8 active rules that get cleared on roughly
1 day in 6; adding more to a pile that isn't cleared is the problem, not the fix.

Hard gates never expire and are the only thing on the card that shouts. Both of
them block other people — that is the bar for adding a third.

## What the 👀 line does and does not claim

It reports **only checks that actually ran**: accounts that returned earnings,
`content_tracker` rows sitting at `received`, and applicants that passed
screening but have sat at `new` for over 48h. An account that fails to respond
is counted as *not reporting*, never as `$0`.

It deliberately does **not** yet cover posting cadence, MM gaps, whale silence
or queue depth — those need the detectors in `UNCVRD_BUILD_PLAN.md` (T1-A and
T1-B). Add a line here only when a query behind it genuinely runs.

## Known limits

- **The money line's day boundary is `Europe/London`**, matching
  `payout-bot/config.mjs`, so the card's number equals the number the existing
  daily report shows. The card's *date label* is Cyprus. Two "yesterdays" that
  disagreed by a timezone would cost more trust than the line is worth.
- 2 requests per creator per day (yesterday, and the previous 7 days as one
  ranged total) — 18 calls, not 144.
- Weekend cards still post; the weekday filters mean they are usually just the
  money line and the checks, which is the point.
