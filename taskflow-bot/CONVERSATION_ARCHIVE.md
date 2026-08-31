_Reconstructed on 2026-07-28 from local Claude Code session transcripts after an account switch made the session list inaccessible. Original conversations were not deleted; this is a synthesized archive of their content._

# TaskFlow — project archive

## What this is

TaskFlow is a Discord bot built for the UNCVRD agency team (roughly 4–6 people). It is not a to-do list — it's a **task-pipeline / handoff automation**. The founding problem, in the user's own words from the original build brief:

> Right now: Luca writes a script in his notes → manually tells Ja to upload it → manually checks Ja did it → manually checks Liz verified it. Everything is chased by hand.

TaskFlow replaces that chasing. A task moves through an ordered chain of people (a "pipeline"). Only one step is ever active at a time; when the person holding it runs `/done`, the bot automatically marks that step complete, promotes the next step to active, and pings the next assignee in a shared task channel. The organizing principle stated in the spec and repeated throughout the build: **"if it's not on someone's list, it's done."** Anyone can run `/tasks @user` and know, without asking, whether that person still owes something.

## Why it was built this way

The original spec (pasted into Claude Code on 2026-06-12) was unusually detailed and prescriptive — it came with a full data model, a defined command surface, explicit edge cases, and an explicit "do not build" list for v1 (no web dashboard, no recurring tasks, no priority/labels, no analytics, no Notion/Airtable sync). The build followed that spec closely:

- **Stack**: Python 3.11+ target with `discord.py` 2.x slash commands (`app_commands`), SQLite for storage (explicitly *not* Postgres or a hosted DB — single guild, low volume), `python-dotenv` for the bot token.
- **Structure**: `bot.py` (entry point), `db.py` (all state changes go through here — restart-safe by construction, nothing lives in memory), `models.py` (typed row wrappers), `cogs/tasks.py` (every slash command).
- **Data model**: `users`, `templates`/`template_steps`, `pipelines`/`pipeline_steps`, and a separate `tasks` table for one-off, non-chained assignments (the "boss explicitly wanted this option" per the spec).
- **Two seeded templates**: **Script** (Write script → Upload script → Verify upload) and **Content Request** (Request content from model → Receive & organize content → Quality check) — directly modeling the Luca/Ja/Liz workflow above.

Claude Code followed the build order the spec requested: data layer first, prove one true end-to-end happy path, then build the rest of the commands. `test_happy_path.py` was written before the Discord-facing code and became the project's regression check — it now covers roughly 33 checks (template seeding, case-insensitive lookup, the start → done → handoff → complete cycle, skip/reassign/cancel, double-click races, stale-nudge windows, and later the recurring-task rules).

One environment wrinkle shaped an early decision: the development Mac only had system Python 3.9 (no Homebrew, no 3.11+ available). Claude wrote the code to run cleanly on 3.9 while still recommending 3.11+ in the README for wherever the bot ultimately gets deployed.

## Decisions and judgment calls made along the way

- **`/done` also completes standalone (non-pipeline) tasks.** The spec gave standalone tasks no completion command, but the "if it's not on the list, it's done" invariant doesn't hold without one, so the `/done` picker was built to mix 🔁 pipeline steps and 📋 standalone tasks in the same select menu. This was flagged explicitly to the user as a deviation worth double-checking.
- **Recurring tasks were added despite being out of v1 scope.** The original spec's "what NOT to build" list explicitly excluded recurring tasks. A week after the initial build, the user asked for repeatable tasks with a chosen assignee, and Claude built `/recurring add/list/remove`: daily or weekly cadence, a chosen time (Europe/London wall-clock), a background checker that runs every 15 minutes (so "09:00" really means "by ~09:15"). By design, an unfinished recurring task is **not** replaced by the next cycle's copy — it piles up visibly, so an ignored daily task shows up as multiple stacked entries on that person's `/tasks` list, which is treated as a feature (visible neglect) rather than a bug.
- **No DMs, ever — only channel pings.** Per spec, because DMs are often disabled by users; a single configured task channel keeps all handoffs visible to the whole team.
- **Admin-gated setup.** `/setup channel`, `/setup member`, `/setup nudge`, and template management all require Manage Server permission; daily-use commands (`/start`, `/done`, `/mytasks`, `/tasks`, `/board`) are open to everyone.

## How the live rollout actually went

Once the code was built and the offline extension load was verified (all command groups registering, templates seeding, the nudge loop binding), the user walked through standing up a real Discord Application: creating it in the Developer Portal, inviting it with `bot` + `applications.commands` scopes, and pulling the server ID. The bot token and server (guild) ID were pasted directly into the chat rather than only into the local `.env` file — Claude flagged this explicitly at the time as a security note ("since the token was pasted in chat... Reset Token in the Developer Portal... if anyone besides you could ever see this conversation").

The bot came online successfully as **TaskFlow#8227** with slash commands synced instantly (via `GUILD_ID`). The user then needed a plainer walkthrough of what "setup" actually meant in practice ("wait so im confused with the setup") — Claude simplified it down to three commands and one channel: create `#tasks`, `/setup channel`, `/setup member` per person. There is a separate note in the transcript clarifying, at the user's request, that TaskFlow is entirely independent from the "Drive → Vault" content-automation bot also running for this team — TaskFlow "doesn't touch Drive or OnlyFans at all," it only automates chasing people.

A command reference (all slash commands and what they do) was later compiled into a table and, at the user's request, posted as a Discord embed into **#general** on the live server.

The bot was run as a foreground/background terminal process during testing, not yet wired into `launchd` (macOS) or `systemd` (Linux) for persistent uptime, even though the README documents both. Both times the bot was launched in this project's session (the initial launch and the relaunch after adding recurring tasks), the background process shows up in the logs later as **killed** — consistent with it only ever running for the duration of an active terminal/session rather than being installed as a standing service.

## A related but separate thread in the same session history

The same long-running Claude Code session that built TaskFlow later (June 19–20) pivoted to fixing a large-video upload failure in a *different* bot — the **Drive → Vault** automation that pushes creator content from Google Drive into OnlyFans vaults. That work (diagnosing OnlyFans' ~100 MB direct-upload ceiling, building a tiered upload path via a private staging bucket and a signed URL, an adversarial code review that caught 9 real bugs, and a mid-stream switch from Supabase storage to Cloudflare R2 for cost reasons) is unrelated to TaskFlow's own functionality and is documented here only to avoid confusing the two systems if this archive is read alongside old transcripts — no TaskFlow code changed during that stretch.

## Current status (as best the transcripts show)

- **Code is complete and passes its own tests.** `db.py`, `models.py`, `cogs/tasks.py`, `bot.py`, `requirements.txt`, `README.md`, and `TESTING.md` all exist exactly as originally scoped, plus the later recurring-tasks addition. `test_happy_path.py` passes end-to-end (happy path, skip/reassign/cancel, recurrence rules).
- **The bot has been live-tested to the point of coming online and syncing commands**, and a command-reference embed was successfully posted to the live server's #general channel. There is no confirmation in the transcripts that a full `/start` → `/done` → `/done` → `/done` handoff pipeline was actually completed end-to-end by the user in Discord — the last messages on the topic were still walking the user through the very first `/setup` steps.
- **The bot is not currently running.** No process is active locally, and there is no `launchd`/`systemd` install on this machine — the "run it persistently" step from the README was never executed. Getting it always-on was explicitly deferred ("cross that bridge after the test").
- **The Discord bot token is dead.** In a later, unrelated session (2026-07-04), the user's TaskFlow bot token was tried as a fallback way to read a different channel and came back `401 Unauthorized` on `/users/@me` — meaning the token has since been reset or revoked in the Discord Developer Portal (possibly as a direct result of the earlier "paste it into chat" security note being acted on) and TaskFlow can no longer authenticate with the token currently in `taskflow-bot/.env`.
- **Never committed to git.** `taskflow-bot/` is untracked in this repository (`git status` shows `?? taskflow-bot/`); there is no commit history for it. Everything currently on disk is what was written directly to the filesystem during the Claude Code sessions.

## What's left / known gaps

1. **Get a fresh bot token.** Reset the token in the Discord Developer Portal, put it in `taskflow-bot/.env` (never paste it into chat again), and relaunch `python3 bot.py`.
2. **Finish the first real `/setup` + test pipeline in Discord** — the transcripts don't show a confirmed successful `/start → /done → /done → /done → complete` run, only the bot coming online and the setup instructions being given.
3. **Decide on persistent hosting.** The README ships both a macOS `launchd` plist and a Linux `systemd` unit, but neither has been installed. Given other bots in this codebase moved from ad-hoc hosting to Railway (see the Railway deployment note in project memory), the same question — keep it on a Mac vs. move to a small always-on host — is still open for TaskFlow specifically.
4. **Commit the code to git.** It currently exists only on local disk.
5. **Live-verify recurring tasks.** The `/recurring` feature passed its offline data-layer tests but was never confirmed to actually spawn and ping in a real Discord run in the transcripts found.
