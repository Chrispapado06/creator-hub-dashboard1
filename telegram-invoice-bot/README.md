# Telegram Invoice Reminder Bot

A tiny, self-contained Telegram bot that sends you one message each day listing
which OFM creators need to be invoiced that day, **how** (method/formula), and
any notes. It does **not** calculate amounts — it's a reminder driven by a fixed
schedule in `creators.json`.

- One daily push (default **9:00 AM Europe/Nicosia**).
- Creators with unresolved terms (`manual_review`) appear **every day** until you
  resolve them, so they don't get forgotten.
- On the weekly digest day (default **Monday**) it also lists the
  `per_withdrawal` creators to check payout requests for.
- Manage everything from Telegram: `/today`, `/list`, `/add`, `/edit`, `/remove`, `/resolve`.

---

## 1. Get a Telegram bot token and your chat id

1. On Telegram, message **@BotFather** and run `/newbot`. Follow the prompts and
   copy the **bot token** it gives you (looks like `123456789:AA...`).
2. **Message your new bot once** (send it any text, e.g. `hi`). This lets it see
   your chat.
3. Copy `.env.example` to `.env` and paste your token into `TELEGRAM_BOT_TOKEN`.
4. Fetch your numeric chat id:
   ```bash
   npm install
   npm run get-chat-id
   ```
   It prints the chat id(s) that have messaged your bot. Put the numeric id into
   `TELEGRAM_CHAT_ID` in `.env`.
   > Telegram only keeps recent updates, so message the bot shortly before
   > running this. If it says "No chats found", message the bot again and retry.

---

## 2. Run it locally

```bash
npm install
npm start
```

You should see `Bot started...`. Message the bot `/today` to get the current due
list on demand.

---

## 3. Edit `creators.json`

The whole schedule lives in [`src/creators.json`](src/creators.json) — a plain
JSON array you can hand-edit. The bot re-reads it on every run, so **saved edits
take effect immediately, no restart needed** (in Docker too, thanks to the bind
mount).

Each creator looks like:

```json
{
  "name": "Blue Bear & Julie",
  "frequency": { "type": "weekly", "day_of_week": "Monday" },
  "method": "(Earnings − subscriptions) × 0.28",
  "notes": "28% of tips & messages; combine both accounts; stats period Mon–Sun",
  "status": "active"
}
```

### `frequency.type` values

| type             | extra fields                                   | when it fires |
|------------------|------------------------------------------------|---------------|
| `weekly`         | `day_of_week` (e.g. `"Monday"`)                | that weekday, every week |
| `biweekly`       | `days_of_month` (e.g. `[1, 16]`) **or** `anchor_date` (`"YYYY-MM-DD"`) | on those days of the month, or every 14 days from the anchor |
| `monthly`        | `day_of_month` (a number `1`–`31`, or `"last"`) | that day each month (`"last"` = end of month; a day past the month's length also fires on the last day) |
| `per_withdrawal` | —                                              | never on a fixed day; listed in the **weekly digest** to check manually |
| `manual_review`  | —                                              | see `status` below |
| `salary`         | —                                              | **never** — excluded from all reminders |

### `status` values

- `"active"` — normal; scheduled by `frequency`.
- `"manual_review"` — appears in **every daily message** under "Needs sorting"
  until you resolve it (via `/resolve <name>` or by editing this field).
- `"salary"` — excluded from all reminders (same effect as `frequency.type: "salary"`).
- `"paused"` — temporarily excluded from all reminders.

### Common edits

- **Pause someone:** set `"status": "paused"`.
- **Change when they're invoiced:** edit the fields in `frequency`.
- **Move a manual-review creator live:** run `/resolve <name>` (or set
  `"status": "active"`), then give them a real `frequency`.

---

## 4. Bot commands

Type `/` in the chat to see the menu. All commands write directly to
`creators.json`, so you never have to hand-edit it unless you want to.

- `/today` — re-send today's due list on demand.
- `/list` — show all creators grouped by scheduled / needs-sorting / salary,
  with each one's rate.
- `/add` — guided add: name → frequency type → date fields → **rate / % /
  formula** → notes → confirm. Send `/cancel` to abort.
- `/edit <name>` — change a creator one field at a time (`rate`, `schedule`,
  `notes`, or `status`); reply `done` when finished.
- `/remove <name>` — delete a creator (asks yes/no first).
- `/resolve <name>` — flip a `manual_review` creator's `status` to `active`.

Name lookups are partial and case-insensitive (`/edit sophie` works); if a
fragment matches more than one creator the bot lists them and asks you to be
more specific.

---

## 5. Deploy to a VPS with Docker

On the server (with Docker + Docker Compose installed), from the project folder:

```bash
docker compose up -d --build
```

The container restarts automatically (`restart: unless-stopped`) and reads
secrets from `.env`. `creators.json` is bind-mounted, so both `/resolve` / `/add`
writes and your own host-side edits persist and take effect live.

### View logs

```bash
docker compose logs -f
```

### Update after a code change

```bash
git pull && docker compose up -d --build
```

### Stop

```bash
docker compose down
```

---

## Configuration (`.env`)

| Variable              | Required | Default          | Purpose |
|-----------------------|----------|------------------|---------|
| `TELEGRAM_BOT_TOKEN`  | yes      | —                | From @BotFather |
| `TELEGRAM_CHAT_ID`    | yes      | —                | Your numeric chat id (also the only chat the bot responds to) |
| `TZ`                  | no       | `Europe/Nicosia` | Timezone for the clock and reminder time |
| `DAILY_CRON`          | no       | `0 9 * * *`      | Cron for the daily push (in `TZ`) |
| `WEEKLY_DIGEST_DAY`   | no       | `Monday`         | Day the payout-request digest is appended |
| `DATA_FILE`           | no       | `src/creators.json` | Override the data file path |

---

## Project structure

```
telegram-invoice-bot/
├── src/
│   ├── index.js         # bot init, cron, commands, add/edit/remove wizards
│   ├── schedule.js      # frequency-matching logic
│   ├── wizard.js        # shared input parsing for /add and /edit
│   ├── format.js        # message formatting (HTML)
│   ├── store.js         # read/write creators.json (atomic + .bak backup)
│   └── creators.json    # seeded schedule data (hand-editable)
├── scripts/
│   └── get-chat-id.js   # one-off helper to find your chat id
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .dockerignore
├── .gitignore
└── README.md
```

## Notes on the seeded data

A few creators in the source schedule didn't specify an exact invoice day; those
were seeded with a documented assumption (noted in each one's `notes`) for you to
correct:

- **Weekly, day assumed Monday:** Bella Leah, Dakota, Marissa, Maylee.
- **Monthly, day assumed end-of-month:** June, Sandra.
- **Sandra** is "salary or invoice" — currently treated as an end-of-month
  invoice; change `frequency.type` to `"salary"` to exclude her instead.
