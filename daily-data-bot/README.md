# UNCVRD Daily Data Bot

VAs ("posters") log their daily outreach through a guided Telegram Q&A.
At the end of the day, **one** compiled summary is sent to **one** person.

```
VA → /report → bot asks 6 questions → entry saved in Supabase
                                              │
                            end of day (22:00 UK cron)
                                              ▼
                          one digest → the recipient's Telegram
```

## What a VA does

In their chat with the bot, a VA sends **`/report`** and answers each
question as it's asked:

1. Which of **our** profiles they worked from
2. How many lead accounts they **followed**
3. How many they **commented** on
4. How many they **liked**
5. How many **posts** they put on our own profiles
6. Any **notes** (or `-` to skip)

The bot confirms with a summary. They can run `/report` again to log a
second profile. `/cancel` abandons a half-finished report.

To change the questions, edit the `FIELDS` array in
[`config.mjs`](config.mjs) — the flow, storage, and digest all read from it.

## The daily digest

`digest.mjs` runs once a day, rolls up every entry for the day per VA
(summing follows/comments/likes/posts and listing notes), and sends a
single message to `TELEGRAM_RECIPIENT_CHAT_ID`. It always sends — even
on a day with no entries — so a quiet day is distinguishable from a
broken bot.

## Setup

### 1. Create the Telegram bot
- Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **token**.
- If VAs will use a **group**, add the bot to it and (in BotFather)
  `/setprivacy` → **Disable**, so it can read group messages. A 1:1 DM
  with each VA works with no extra setup and is the cleanest option.

### 2. Find the recipient's chat id
- Have the **one person** open a chat with the bot and send `/id`.
- The bot replies with `Chat id: …` — that's `TELEGRAM_RECIPIENT_CHAT_ID`.
- (`/id` also works in a group if you'd rather the digest go to a group.)

### 3. Apply the database migration
The bot stores entries, in-flight conversations, and its Telegram cursor
in Supabase. The migration is
`supabase/migrations/20260609120000_daily_outreach.sql` (repo root).

```bash
# from the repo root
supabase db push
```

### 4. Set the secrets
For **GitHub Actions** (repo → Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_RECIPIENT_CHAT_ID` | from `/id` (step 2) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |

`TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` may
already exist from the other bots — reuse them.

## Running it

Two GitHub Actions workflows are included:

- **`.github/workflows/daily-data-bot.yml`** — runs the collector in
  ~5.5h shifts (new shift every 6h). Telegram queues messages during the
  short gap between shifts, so nothing is lost — answers are just briefly
  delayed around the changeover.
- **`.github/workflows/daily-data-digest.yml`** — sends the digest daily
  at **22:00 UTC** (23:00 UK in summer, 22:00 in winter). Change the
  `cron` line to adjust.

Both can be triggered manually from the Actions tab ("Run workflow").

### Zero-latency 24/7 (optional, recommended if you have a host)
For instant replies with no shift gaps, run the collector as a
long-running process on any always-on machine (VPS, Railway, Fly, a Pi)
and **disable** `daily-data-bot.yml`:

```bash
cd daily-data-bot
TELEGRAM_BOT_TOKEN=... \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
BOT_RUN_FOR_MS=315360000000 \
node bot.mjs            # BOT_RUN_FOR_MS huge = effectively forever
```

> ⚠️ Run **only one** collector at a time. Telegram allows a single
> `getUpdates` consumer per bot — two will fight (HTTP 409). The Actions
> workflow's concurrency group enforces this for you; if you run locally,
> disable the workflow first.

### Local test run
```bash
cd daily-data-bot
TELEGRAM_BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  BOT_RUN_FOR_MS=120000 node bot.mjs        # collector for 2 minutes

TELEGRAM_BOT_TOKEN=... TELEGRAM_RECIPIENT_CHAT_ID=... \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node digest.mjs                            # send the digest now
```

## Data model

- `daily_outreach_entries` — one row per completed report.
- `daily_outreach_sessions` — in-flight Q&A state (deleted on finish/cancel).
- `daily_outreach_state` — singleton; last processed Telegram `update_id`.
