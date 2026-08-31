_Reconstructed on 2026-07-28 from local Claude Code session transcripts after an account switch made the session list inaccessible. Original conversations were not deleted; this is a synthesized archive of their content._

# Shift Downtime Monitor — Project Archive

## What it is

Shift Downtime Monitor watches every reachable OnlyFans (OF) account for UNCVRD and, when a fan message goes unanswered for too long, escalates in Discord — first pinging the chatter and QA on shift, then the shift role, then Management if it's still unresolved. It lives in `shift-downtime-monitor/` in this repo and today runs as an always-on Railway service (it started life as a 5-minute GitHub Actions cron and was later migrated).

The spec originated from a WhatsApp screenshot from Luca describing the problem as "spotting downtime on shift." The build began 2026-06-20 and has been iterated on continuously since, picking up a second major feature area (whale/spend flagging and per-whale handling) along the way that ended up being just as large as the original downtime-alert feature.

## Why it was built

Chatters staff OF accounts in shifts, and the team had no automated way to notice when a fan message was sitting unanswered — it relied on someone noticing. The ask was an alerting system with an escalation ladder tied to how "important" the account is (tier) and how long the message has waited, that pings the right human (not just a generic channel) so someone actually sees it.

## Core design and the key technical finding

The foundational blocker was: does the OF API even reflect chatter replies fast enough to be a reliable signal, given chatters actually reply through Infloww rather than through the OF web app directly? Before building anything, a gating test was run: Blue Bear's account was watched for 12 minutes while chatters replied organically, and every Infloww reply showed up in the OF API within 3–19 seconds — comfortably under any alert threshold. That result unblocked the whole project.

The second key finding, which shaped both this project and turned into a separate flagged bug, is that the live OF API (`GET /{acct}/chats`) has **no `sentBy` or `isFromUser` field** on `lastMessage`, unlike what the codebase's existing `of-api.ts` assumed. The reliable way to tell whether a fan or the creator sent the last message is `lastMessage.fromUser.id === chat.fan.id` — if the ids match, the fan sent it and the thread is unanswered; otherwise the creator (a constant id per account) did. `_view` is always `"i"` and unreadMessagesCount can be 0 even on a fan-last thread, so neither is usable. This finding was written up separately as `bug-of-api-sentby-misclassified` because it meant production `src/lib/of-api.ts` was silently mislabeling every chat message as "creator" — flagged as out-of-scope background work rather than fixed inline as part of this project.

Detection unit is the **account**, not the individual thread: an account "is down" when its oldest unanswered fan thread crosses a threshold, and each escalation level fires once per breach (idempotent). Two noise filters were needed before the signal was trustworthy:
- **Self-threads / mass-DM false positives** — creators are themselves subscribed to other pages and receive mass-DMs that look exactly like an unanswered fan message (e.g. Marissa/Julie getting pinged over `@marissamunozfree`). Fixed by checking the OF `fan` object's `isPerformer`/`isRealPerformer`/`canEarn` flags, which are true for creator accounts and false for real fans.
- **Abandoned backlog** — threads older than a `maxWaitSec` window (60 minutes) are excluded so genuinely old, ignored conversations don't count as "live" downtime.

## The escalation ladder (current)

| Wait | Condition | Action |
|------|-----------|--------|
| ≥ 3–10 min (tuned several times, currently 7 min globally) | — | Ping the chatter on shift (falls back to @everyone/shift role in the shift channel if the chatter can't be resolved) |
| ≥ 10 min | account is tier A/B | Escalate again — ping chatter + shift role |
| ≥ 20 min | — | Message Management |

Account tiers (Blue Bear = A, Marissa/Emma/Meg = B, June/Julie = C) and the QA/shift-block Discord ids live in `config.mjs`, not the database — deliberately following the existing `payout-bot` convention rather than introducing a dependency on a not-yet-existing schema.

## Key decisions and how they evolved

The very first design (2026-06-20) assumed a `shift_program` Supabase table synced from a Google Sheet, one row per (account, shift window), because "who is on shift" seemed like it needed structured data. A migration (`supabase/migrations/20260620120000_shift_downtime_monitor.sql`, tables `shift_program` + `downtime_alerts`) was written for this. But when the actual shift schedule sheet was analyzed, it turned out to be a genuinely messy weekly grid — no shift clock-hours, no tier legend, account names that don't match OF usernames one-to-one (`Marissa (Inbox 1/2)`, `Meg Fansly`, etc.), a roster that churns week to week, and QA appearing as both a QA and a chatter in different rows. Parsing it reliably wasn't going to happen without more decisions from the user.

So v1 shipped deliberately simplified: **no database, no sheet.** Who's "on shift" is resolved purely from the current Philippine time mapped to one of three fixed 8-hour blocks in `config.mjs` (`SHIFT_BLOCKS`), each with a QA Discord id hardcoded. Idempotency uses a committed `state.json` ledger (mirroring the existing `payout-bot` pattern) instead of the `downtime_alerts` table. The Supabase migration was kept in the repo but explicitly marked "not used by v1" — staged for a v2 that would parse the real shift sheet.

v2 did eventually arrive, but not through the database: `parse-shifts.mjs` was built as a proven parser for the weekly grid (3 grids/week = the 3 shift blocks, one QA per grid), and `resolve-discord-ids.mjs` resolves the team's Discord usernames to ids via the "Bernard" Discord bot. On 2026-07-06 this shipped as the "chatter-ping" feature: L1/L2 alerts now @mention the specific chatter responsible for that account this shift (falling back to the shift role only if the chatter can't be resolved), built via a new `roster.mjs` that fetches the shift sheet as CSV and maps `block → weekday → account → chatter`. The chatter name→Discord-id map is kept out of the public repo (`chatters.json` is gitignored, loaded via a private Railway env var `CHATTERS_MAP`) since the repo itself is public. A handful of chatters (Nikola, Jeremy, Randy) were still unresolved as of the last update and fall back to the role ping.

Routing to Discord also changed shape more than once: it started as two webhooks (Chatter-QA and Management), moved to per-shift-block channels with role mentions via a bot token, and was ultimately consolidated (2026-07-05) into a **single downtime channel** for all shifts (each shift block keeps its own role id, so the mention still differentiates who's being paged) after the old per-shift channels and a duplicate, still-running GitHub Actions cron were found to be double-posting.

## Bugs and operational gotchas hit along the way

- **Duplicate cron double-posting.** After the monitor moved to an always-on Railway service, the original GitHub Actions workflow (`.github/workflows/shift-downtime-monitor.yml`, cron every 5 min) was still running in parallel with its own separate `state.json` ledger, causing every alert to fire twice and spamming `[skip ci]` state commits that fought with Railway's deploys. Fixed by removing the GitHub Actions `schedule:` trigger (kept manual `workflow_dispatch` only).
- **Discord channel access silently swallowing every alert.** After consolidating to one channel, the bot ("Bernard") had no permission on the new channel, so every downtime ping failed with a 403 while the code still logged "fired" (the counter incremented before the failing POST). Fixed once the user granted View/Send/Mention on the channel in Discord; also surfaced a red herring where rapid Discord API calls from the dev machine were being blocked by Cloudflare (403 code 1010) in a way that looked identical to a real Discord permissions error (403 code 50001) — worth distinguishing before assuming a permissions problem.
- **OF API outage crashed the whole service.** On 2026-07-15 the monitor was down for roughly 11.5 hours (04:28–16:02 UTC) because OF's `/accounts` endpoint started returning 500/504s, and the one unguarded per-cycle call to it threw uncaught, which triggered `process.exit(1)`, which Railway crash-looped past its restart-retry limit until the service was marked crashed outright. This is the fix in the most recent commit, `e8a0827` ("downtime: survive OF /accounts blips instead of crashing") — the call is now wrapped in try/catch, and on failure the loop just logs, sleeps, and retries next cycle instead of dying. The lesson taken from this: any hard external dependency inside an always-on loop has to degrade gracefully, because a bare throw kills the whole process.
- **Account roster went stale/hardcoded.** The monitor originally only watched a hardcoded list of creators copied from `payout-bot`, so newly connected creators (Antonella, Ella) were invisible to it. Fixed by pulling the live account list from OF's `/accounts` endpoint every cycle instead, tiering unknown accounts as "C" by default and logging connected-but-unauthenticated accounts as needing re-auth. Usernames also drift over time (June's OF username changed from `thisisjunee` to `junehaynes`), so tier lookups key off the live username, not a cached one.
- **OF API key is IP-locked to Railway's egress.** Once the monitor moved to Railway, the same API key returns 403 Forbidden when called from anywhere else (a dev machine, the repo's local `.env`), so a chat/account can no longer be inspected ad hoc from a laptop — debugging has to go through Railway logs or temporary in-service logging.
- **Cost tuning.** OF API polling isn't cached, so every scan call costs credits. The poll cadence was tuned down twice (45s → 120s → 180s) purely to reduce OF credit burn, trading off worst-case detection latency (now roughly 10 minutes) against cost; the real fix (webhooks instead of polling, cited as roughly 100x cheaper) was identified but deferred as a "v2" item, not yet built.

## Beyond downtime alerts: whale/spend flagging grew into a second major feature

Starting 2026-06-22, the same monitor absorbed a request from Lance/Liz/Luca to flag high-value ("whale") activity, since the OF API has no per-fan lifetime-spend field — the team's own spend-tier OF lists (`Big Spender ≥ $250`, `WHALE $500+`, etc.) became the actual signal, cached locally in `whales.json` and refreshed periodically. This grew over several iterations into: flagging new whale spend into a dedicated `#chatter-pins-qa-pins` Discord channel; flagging any whale active in a shift (not just ones left waiting) with context (previous topic, last script line, upcoming milestone); a `/whale` Discord slash command (add/remove/list/stats) backed by a Supabase table (`whale_paydays`) for tracking each whale's handling tag (DO NOT SELL / PRE-SELL / SELL / REVIVE) and payday; and payday reminders posted each morning. A separate one-shot AI tool, `whale-intel.mjs`, was scaffolded to extract whale context (age, last objection, etc.) from raw chat history using Claude Haiku, piloted on one account, but was not yet run against the full whale list as of the last recorded update.

Two smaller list-management automations were also built but shipped **dry-run only** (logging what they'd do, not yet flipped to write): auto-adding a fan to the account's "No MM" exclude list right after a chatter replies to them, and moving fans who haven't spent in 7/14/28 days into an "idle spender" list. Both need `LIST_AUTO_WRITES=1` to actually touch OF list membership, and the recommendation on record is to verify on a single fan before enabling broadly.

An MM (mass message) / feed / story "EOD" (end-of-day) and per-shift reporting feature was also added on top of the same bot, tracking daily send/view counts per account (recorded by id so deleted MMs still count, unlike the pre-existing "Captain Hook" bot it was compared against), because the OF API has no way to see a historical count once an MM is deleted. This was reformatted at least once to match the existing report format the team was used to.

One thing was explicitly identified as **not buildable** on the current OF API: a "no mass message sent in ~2 hours" flag, because mass messages are sent through Infloww, which the OF API's `mass-messaging` endpoint doesn't reflect at all (it's empty for every account) — this would need a direct Infloww integration.

## Current status

The monitor is deployed and live on Railway as an always-on service (not the original GitHub Actions cron, which was deliberately disabled to avoid double-firing). It watches every OF account discovered live from `/accounts`, escalates unanswered fan threads through the chatter → shift-role → Management ladder into a single consolidated Discord channel, and separately sweeps for whale spend/activity into a whale-focused channel with a working `/whale` Discord command backed by Supabase. The most recent committed change (`e8a0827`) hardened the service against OF API outages so a bad OF response no longer takes the whole monitor down.

Known gaps / open items at the time of the last recorded work:
- A handful of chatters (Nikola, Jeremy, Randy) still have no resolved Discord id and fall back to the generic shift-role ping.
- One row in the shift schedule sheet had a data bug (the Evening block's day-header repeats "Wednesday" across several columns), flagged for the user to fix at the source.
- The webhook-based, push-instead-of-poll approach that would meaningfully cut OF API cost (and detection latency) has been identified as the next big lever but not implemented.
- The `whale-intel.mjs` chat-extraction pilot was built and verified on a small sample but had not been run as a full sweep.
- The original `shift_program` / `downtime_alerts` Supabase migration from the very first design is still sitting in the repo unused, superseded by the sheet-based roster approach — it would only come back into play if a future version moves shift data and alert history into the database.
