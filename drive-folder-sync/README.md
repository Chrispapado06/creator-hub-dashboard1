# Drive Folder Sync

Auto-copies new files from each creator's source Drive folder into a centralised
agency destination folder. Runs every 5 minutes, never copies the same file
twice, optionally logs to a Sheet, and emails you on failure.

## Files
- `Code.gs` — the full Apps Script
- `appsscript.json` — manifest with required OAuth scopes

---

## 1. Deploy in the Apps Script editor

1. Go to **https://script.google.com** → **New project**.
2. Delete the placeholder `Code.gs` content and paste in this repo's `Code.gs`.
3. Show the manifest: **Project Settings (gear icon)** → tick
   **"Show 'appsscript.json' manifest file in editor"**.
4. Open `appsscript.json` in the editor and replace its contents with this
   repo's `appsscript.json` (this declares the OAuth scopes).
5. Edit the `CONFIG` object at the top of `Code.gs`:
   - Fill in one `{ sourceFolderId, destFolderId, creatorName }` per creator.
   - `logSheetId`: paste a Sheet ID to enable logging, or leave `""` to skip.
   - `alertEmail`: where failure alerts go.
   - `includeSubfolders`: `true` to also sweep subfolders of each source.
6. **Save** (Ctrl/Cmd-S).

## 2. Authorise

1. In the function dropdown (top toolbar) pick **`syncAllFolders`** → **Run**.
2. Google will prompt for authorisation → **Review permissions** → choose your
   account → **Advanced** → **Go to (project) → Allow**.
   - It warns the app is "unverified" — that's normal for your own scripts.
3. After it runs once, check **Execution log** (View → Logs) to confirm it found
   and copied files.

> **Tip:** if you only want to sync files uploaded *from now on* and skip the
> existing backlog, run **`markExistingAsProcessed`** once before the first real
> run. It marks current files as already-done without copying them.

## 3. Set up the 5-minute trigger

**Easy way (built-in helper):**
- In the function dropdown pick **`createTrigger`** → **Run**. Done — it installs
  a time-driven trigger firing `syncAllFolders` every 5 minutes (and clears any
  duplicate it had previously made).

**Manual way:**
- Left sidebar → **Triggers (alarm-clock icon)** → **Add Trigger**:
  - Function: `syncAllFolders`
  - Event source: **Time-driven**
  - Type: **Minutes timer** → **Every 5 minutes**
  - Save.

> Apps Script has no true "on new file" Drive trigger, so a 5-minute timer is
> the standard approach — uploads transfer within ~5 minutes.

## 4. How to find a Google Drive folder ID

1. Open the folder in Drive (browser).
2. Look at the URL:
   `https://drive.google.com/drive/folders/`**`1AbCdEfGhIjKlMnOpQrStUvWxYz`**
3. The string after `/folders/` is the folder ID. Copy it into `CONFIG`.

- **Shared Drives** work the same way — open the folder, copy the ID from the URL.
- The Google account running the script must have at least **Viewer** on each
  source folder and **Editor/Contributor** on each destination folder.

## 5. OAuth scopes (already in `appsscript.json`)

| Scope | Why |
|-------|-----|
| `.../auth/drive` | read source folders, copy files into destinations |
| `.../auth/spreadsheets` | write the optional transfer log sheet |
| `.../auth/script.scriptapp` | let `createTrigger` install the time trigger |
| `.../auth/script.send_mail` | send failure-alert emails via `MailApp` |

If you leave `logSheetId` blank you can drop the `spreadsheets` scope; if you set
`alertEmail` to `""` you can drop `script.send_mail`. Keeping them is harmless.

---

## How "never copy twice" works
Each source folder's processed file IDs are stored in **ScriptProperties** as a
JSON map (sharded across keys to stay under Apps Script's 9 KB-per-value limit).
A file is only marked processed after a *successful* copy, so failed transfers
are retried automatically on the next run. Copies preserve the original filename
via `file.makeCopy(name, destFolder)`.
