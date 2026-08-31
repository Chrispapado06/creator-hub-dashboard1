# TaskFlow — task-handoff bot for Discord

Task **pipelines with automatic handoffs**, not a to-do list. A task moves
through a chain of people; when one person runs `/done`, the next step lands
on the next person's list and they get pinged in the task channel.
The rule the whole bot serves: **if it's not on someone's list, it's done.**

```
/start "Script" "Script — Marissa promo July"
  → 🚀 Step 1/3: Write script   → @Luca
@Luca runs /done
  → 🔁 Step 2/3: Upload script  → @Ja   (handed off by @Luca)
@Ja runs /done
  → 🔁 Step 3/3: Verify upload  → @Liz  (handed off by @Ja)
@Liz runs /done
  → ✅ Pipeline complete
```

Storage is a single SQLite file (`taskflow.db`) next to the bot — restart-safe,
nothing lives in memory.

## Setup from zero

### 1. Create the Discord application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it `TaskFlow`.
2. Left sidebar → **Bot** → **Reset Token** → copy the token (you'll paste it into `.env`).
3. On the same Bot page: the **Privileged Gateway Intents** can all stay **OFF** —
   TaskFlow only uses slash commands and needs no privileged intents.

### 2. Invite the bot to your server
1. Left sidebar → **OAuth2** → **URL Generator**.
2. Scopes: tick **`bot`** and **`applications.commands`**.
3. Bot permissions: tick **Send Messages**, **Embed Links**, **Use Slash Commands**
   (and **Read Message History** is harmless to include).
4. Open the generated URL, pick your server, authorize.

### 3. Run it
Requires Python 3.9+ (3.11+ recommended).

```bash
cd taskflow-bot
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit .env:
#   DISCORD_TOKEN = the token from step 1
#   GUILD_ID      = your server id (right-click server icon → Copy Server ID;
#                   enable Developer Mode in User Settings → Advanced first).
#                   Optional, but makes slash commands appear instantly.
python3 bot.py
```

You should see `TaskFlow is up` in the log and the slash commands in your server.

### 4. First-time `/setup` (needs Manage Server)
```
/setup channel #tasks            ← where all pings & updates go
/setup member @Luca scriptwriter
/setup member @Ja   uploader
/setup member @Liz  qa
/setup nudge 48                  ← optional; hours before a stale-step nudge
```

Two templates ship built-in: **Script** (Write → Upload → Verify) and
**Content Request** (Request → Organize → QC). Add more with `/template create`
— no code edits needed.

## Commands

| Command | What it does |
| --- | --- |
| `/start template title` | Start a pipeline; step 1's assignee is pinged |
| `/done` | Complete **your** active step → auto-handoff ping to the next person |
| `/mytasks` | Your open steps + standalone tasks (private) |
| `/tasks @user` | Someone else's open items — the "is it done?" check |
| `/task add @user title due:` | Standalone task, no chain |
| `/recurring add @user title every: weekday: time:` | Repeating task — daily or weekly, auto-assigned + pinged each cycle |
| `/recurring list` / `/recurring remove` | Manage repeating rules |
| `/board` | All active pipelines, who's holding what, for how long |
| `/reassign step @user` | Hand an active step to someone else (logged) |
| `/skip step` | Skip a step (admin or its assignee) — marked *(skipped)* |
| `/cancel pipeline` | Cancel (creator or admin) |
| `/template create/list/delete` | Manage templates (admin) |
| `/setup channel/member/nudge` | Configuration (admin) |

Notes:
- All pings go to the configured **task channel**, never DMs.
- A step sitting `active` longer than the nudge threshold (default 48h) gets a
  gentle channel nudge; the checker runs every 12h.
- If a template step has no default assignee, `/start` asks you to pick one
  before the pipeline is created.
- Recurring tasks fire on **Europe/London** wall-clock time (checker runs every
  15 min, so "09:00" means within ~15 min of 09:00). Each spawn is a normal
  task: it lands on the assignee's `/mytasks`, pings the channel, and is
  completed via `/done`. Stopping a rule keeps already-spawned copies.

## Running it persistently

### macOS (launchd)
Save as `~/Library/LaunchAgents/com.uncvrd.taskflow.plist` (fix the paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>com.uncvrd.taskflow</string>
  <key>WorkingDirectory</key> <string>/Users/YOU/taskflow-bot</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/YOU/taskflow-bot/venv/bin/python3</string>
    <string>/Users/YOU/taskflow-bot/bot.py</string>
  </array>
  <key>RunAtLoad</key>  <true/>
  <key>KeepAlive</key>  <true/>
  <key>StandardOutPath</key>   <string>/Users/YOU/taskflow-bot/taskflow.log</string>
  <key>StandardErrorPath</key> <string>/Users/YOU/taskflow-bot/taskflow.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.uncvrd.taskflow.plist   # start (and on every boot)
launchctl unload ~/Library/LaunchAgents/com.uncvrd.taskflow.plist # stop
```

### Linux (systemd)
Save as `/etc/systemd/system/taskflow.service` (fix user/paths):

```ini
[Unit]
Description=TaskFlow Discord bot
After=network-online.target

[Service]
User=youruser
WorkingDirectory=/home/youruser/taskflow-bot
ExecStart=/home/youruser/taskflow-bot/venv/bin/python3 bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now taskflow
journalctl -u taskflow -f        # logs
```

## Files
- `bot.py` — entry point, command sync
- `db.py` — ALL state changes (SQLite); restart-safe by construction
- `models.py` — typed row wrappers
- `cogs/tasks.py` — every slash command, views, nudge loop
- `test_happy_path.py` — data-layer test, run with `python3 test_happy_path.py`
- `TESTING.md` — manual end-to-end test script for Discord itself
