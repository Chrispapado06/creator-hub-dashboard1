# Shift Downtime Monitor

Watches every reachable OnlyFans account and, when a fan message goes
unanswered, escalates in Discord — pinging the **QA on shift**. Built from the
WhatsApp brief ("spotting downtime on shift").

## Escalation ladder

Detection unit is the **account**: it "is down" when its **oldest unanswered
fan thread** crosses a threshold. Each level fires **once per breach**.

| Wait | Condition | Action |
|------|-----------|--------|
| **≥ 3 min**  | — | **@everyone** in the current **shift channel** (Day / Evening / Night) |
| **≥ 10 min** | account is **tier A/B** | Escalate — **@everyone** in the shift channel |
| **≥ 20 min** | — | Message **Management** |

The shift channel is picked by current time (GMT): 08–16h → Day, 16–24h →
Evening, 00–08h → Night (see `config.mjs` → `SHIFT_BLOCKS`). Posting + @everyone
uses the Bernard bot (`DISCORD_BOT_TOKEN`); until that's set, L1/L2 fall back to
the Chatter-QA webhook pinging the QA, so coverage never drops.

When the chatter replies in Infloww, the OF API reflects it within seconds
(verified ~3–19s) and the thread clears, ending the breach.

## Whale / spend flags

Once per run the monitor sweeps each account's `transactions` and flags spend by
**whales** into `#chatter-pins-qa-pins`:
`🐋 Model — FanName (@user) spent $X (type) · <of-link>`.

A whale = a fan in the account's high-spend OF lists (`Big Spender ≥ $250`,
`≥ 500`, `WHALE …`) — the OF API has no per-fan lifetime spend, so those lists
*are* the signal. Membership is read once and cached in `whales.json`, refreshed
every `WHALE_REFRESH_HOURS` (12), so the per-run cost stays ~1 credit/account.
Each flag fires once (idempotent by txn id) within `WHALE.lookbackSec`.

Tune: `WHALE_LIST_PATTERN` (which list names count), `WHALE_HARD_FLOOR` (also
flag any single purchase ≥ $X from a non-listed fan; 0 = whales only),
`WHALE_TIERS`, `WHALE_ENABLED=0`. Needs `DISCORD_QA_PINS_CHANNEL_ID` + the bot
token; logs in DRY_RUN until set.

> Not buildable on the OF API: the **MM-gap flag** (no mass message sent in ~2h)
> — `mass-messaging` is empty for every account because MMs are sent via
> Infloww, which the OF API can't see. Needs an Infloww integration.

## List automations (dry-run by default)

Two list-management automations, **logging only** until `LIST_AUTO_WRITES=1`:

- **#1 exclude-on-reply** — when a chatter replies to a fan, add that fan to the
  account's current-shift exclude ("No MM") list. The exclude lists are
  auto-detected by name (`EXCLUDE_LIST_PATTERN`) and the one matching the live
  shift is chosen at reply-time.
- **#2 idle-spender mover** — records each fan's last-spend date in
  `lastspend.json` over time; when a fan crosses `INACTIVITY_DAYS` (7/14/28)
  with no spend, it'd move them to a `No spend Nd` list. Accurate for
  low-volume accounts immediately; fully accurate after ~28 days of recording.

Both print exactly what they'd change to the run log; enable real OF list writes
with `LIST_AUTO_WRITES=1` (verify on a single fan first). The OF write endpoints
(`addUserToList` / `removeUserFromList` / `createUserList`) are wired in `of.mjs`.

## v1 (current) — no database, no sheet

- **Signal:** `GET /{acct}/chats` → a thread is unanswered when
  `lastMessage.fromUser.id === fan.id` (the live API has no `sentBy`; see
  `of.mjs`). Age = `now − lastMessage.createdAt`.
- **Who to ping:** the **QA on shift**, resolved purely from the current
  **Philippine time** → shift block (`config.mjs` → `SHIFT_BLOCKS`):
  Block 1 `00:00–08:00` Lance · Block 2 `08:00–16:00` Liz · Block 3 `16:00–24:00` Yen.
- **Noise filters:** skips self-threads (account messaging itself) and threads
  older than `maxWaitSec` (60 min — abandoned backlog, not live downtime).
- **Idempotency:** a committed `state.json` ledger (like `payout-bot`), so the
  5-min cron never re-sends the same breach.
- **Timing / cost:** each cron invocation self-loops every **2 min** for ~4.5 min
  (`config.mjs` → `LOOP`); the workflow fires every 5 min → continuous coverage.
  2-min cadence (vs 45s) keeps OF API usage ~190k credits/mo. Polling isn't
  cached (`is-cached=false`), so the real cost cut is webhooks (a v2).
- **Safe default:** with no webhook configured it runs **DRY_RUN** (logs only).

## Config to keep current

- **`config.mjs` → `SHIFT_BLOCKS`** — QA Discord ids per block. Update when the
  QA rota changes (currently Lance / Liz / Yen).
- **`config.mjs` → `ACCOUNT_META`** — each account's `tier` (A/B get the 10-min
  step). Currently Blue Bear = A; Marissa/Emma/Meg = B; June/Julie = C.

## Run locally

```bash
# DRY_RUN (logs intended alerts; no Discord sends). Auto-on when no webhook set:
node shift-downtime-monitor/monitor.mjs

# Gating probe — how fast Infloww replies surface in the OF API:
node shift-downtime-monitor/probe-of-sync.mjs                  # snapshot all
node shift-downtime-monitor/probe-of-sync.mjs bluebeari3vip --mins=12  # watch one
```

## Deploy (runs every 5 min)

GitHub Actions: `.github/workflows/shift-downtime-monitor.yml`. Required repo
secrets:

| Secret | Value |
|--------|-------|
| `ONLYFANSAPI_KEY` | (already set — shared with the other bots) |
| `DISCORD_WEBHOOK_DOWNTIME` | the **Chatter-QA** channel webhook URL |
| `DISCORD_WEBHOOK_GROUP` | the **Management** channel webhook URL |

The workflow commits `state.json` back to the repo after each run.

## v2 (next) — per-chatter pings from the shift sheet

v1 pings the QA on shift; v2 also pings the specific **chatter** covering each
account. That needs the messy schedule sheet parsed into
`(week, block, day) → chatter`:
- `parse-shifts.mjs` — proven parser for the weekly grid (3 grids/week = the 3
  shift blocks; QA per grid). Reliable on June-format weeks; the later
  "Whales" grids need more work.
- `resolve-discord-ids.mjs` — resolves the team's Discord usernames → ids via
  the Bernard bot (needs Server Members Intent).
- The Supabase migration `supabase/migrations/20260620120000_shift_downtime_monitor.sql`
  (`shift_program` + `downtime_alerts`) is staged for when v2 moves shift data
  + alert history into the database. **Not used by v1.**
