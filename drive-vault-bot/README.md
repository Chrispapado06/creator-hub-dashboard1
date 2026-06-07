# Drive → OnlyFans vault bot

Every 5 minutes, this bot checks each model's Google Drive folder — **and
every subfolder inside it** (e.g. named "script" folders) — for new
photos/videos, and uploads them into that creator's OnlyFans vault (via the
OnlyFans API). Files are **left exactly where you put them**; the bot just
remembers what it already uploaded so it never doubles up.

```
model drops file anywhere in their Drive folder tree
        │   (within ~5 min)
        ▼
  GitHub Actions cron  ──►  walk folder + subfolders
        │                          │
        │                   download new bytes
        │                          │
        └──►  POST /api/{acct}/vault/media  ──►  record file id in state.json
```

- **Host:** GitHub Actions (`.github/workflows/drive-vault-bot.yml`), cron `*/5`.
- **Subfolders:** the whole folder tree is scanned (depth-guarded by
  `MAX_FOLDER_DEPTH`), so organising content into "script" folders just works.
- **Dedupe:** `state.json` records every processed Drive file id. A file is
  marked done **only after a successful vault upload**, so failures are safely
  retried next run. Nothing in Drive is moved, renamed, or deleted.
- **Pattern:** same shape as `payout-bot/` (standalone Node ESM + committed state).

## One-time setup

### 1. Create a Google service account
1. In the [Google Cloud Console](https://console.cloud.google.com), create
   (or pick) a project and **enable the Google Drive API**.
2. **IAM & Admin → Service Accounts → Create service account.** Name it e.g.
   `uncvrd-drive-vault`. No project roles are needed.
3. On the service account, **Keys → Add key → Create new key → JSON**.
   Download the JSON file. Note the service account's email
   (`...@...iam.gserviceaccount.com`).

### 2. Share each model's folder with it
For every model, share their upload folder with the service-account email.
**Viewer** access is enough — the bot only reads; it never moves, renames, or
deletes anything. Any subfolders inside a shared folder are covered too.

### 3. Fill in `config.mjs`
For each model add a row to `DRIVE_MAP` with:
- `name` — display name.
- `account_id` — their OnlyFans `acct_...` id (same as in `payout-bot/config.mjs`).
- `folder_id` — from the folder URL:
  `https://drive.google.com/drive/folders/`**`<folder_id>`**.

### 4. Add the GitHub secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | paste the **entire** contents of the JSON key file |

`ONLYFANSAPI_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` already exist (used
by `payout-bot`). Telegram is optional — without it the bot just logs.

### 5. Test
Actions → **Drive → OF vault bot** → **Run workflow**. Drop a test image into a
configured folder (or a subfolder inside it) first; after the run it should
appear in that creator's OnlyFans vault. The file stays put in Drive.

## Notes & limits
- **File size:** the runner holds each file in memory during upload. Files over
  `MAX_BYTES` (default 2 GB, in `config.mjs`) are **skipped and flagged**, never
  silently dropped. Raise the limit only if needed.
- **Only `image/*` and `video/*`** are uploaded; other files in the folders are
  ignored (see `ALLOWED_MIME_PREFIXES`).
- **Throughput:** up to `MAX_FILES_PER_CREATOR_PER_RUN` (default 25) files per
  model per run; any backlog is picked up on the next 5-min run.
- **Vault behaviour:** OnlyFans has no native "save straight to vault" upload;
  the OnlyFans API handles the upload-and-store flow behind
  `/vault/media`. This bot relies on that same endpoint the dashboard uses
  (`src/lib/of-api.ts → uploadMedia`).
