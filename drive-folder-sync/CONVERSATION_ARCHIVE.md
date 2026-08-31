_Reconstructed on 2026-07-28 from local Claude Code session transcripts after an account switch made the session list inaccessible. Original conversations were not deleted; this is a synthesized archive of their content._

# Drive Folder Sync — Project History

## What this is

`drive-folder-sync/` is a standalone Google Apps Script project (not part of the main creator-hub-dashboard Next.js app — it deploys separately at script.google.com). It watches each OnlyFans creator's individual Google Drive upload folder and automatically copies any new files into a centralised agency destination folder, on a 5-minute timer. It was built for the UNCVRD agency's content pipeline: creators drop raw content into their own folder, and the agency team picks it up from a consolidated destination without creators needing access to (or the agency needing to police) a shared folder.

The project lives alongside a handful of other single-purpose bots in this repo (`drive-vault-bot/`, `ad-tracker/`, `shift-downtime-monitor/`, etc.) — this one was explicitly modeled on the existing `drive-vault-bot/` pattern: a `Code.gs`, an `appsscript.json` manifest, and a README with copy-paste deploy steps, so it's not a web app or a bot that runs in this repo's CI — it's entirely Google-hosted.

## Why it was built

The brief (given directly, fully spec'd, on 2026-06-09) was explicit: this is for an OnlyFans management agency where creators upload content to their own individual source folders, and new files need to transfer automatically to a centralised agency destination folder, within a few minutes, without manual intervention. The requirements called out multi-creator support (many source→destination folder pairs), a 5-minute time-driven trigger (Apps Script has no true "on new file" Drive trigger, so polling is the standard approach), never double-copying a file, an optional transfer log to a Sheet, graceful per-file error handling, and an email alert on failed transfers. The user supplied the exact `CONFIG` shape they wanted up front, which made the build largely mechanical.

## How it works

- `CONFIG.pairs` is a list of `{ sourceFolderId, destFolderId, creatorName }` objects, one per creator.
- `syncAllFolders()` (the function the 5-minute trigger calls) loops every pair, lists files in the source folder (optionally recursing into subfolders if `includeSubfolders` is `true`), and for each file not already marked processed, calls `file.makeCopy(filename, destFolder)` — a copy, not a move, so the source file is untouched and the destination gets the original filename.
- **Duplicate-prevention**: processed file IDs are stored in `PropertiesService` as a JSON map, keyed per source folder. Since Apps Script caps each stored property at 9 KB, the set is sharded across multiple keys (`key`, `key:1`, `key:2`, …) once it grows — this was called out explicitly as necessary once a creator's folder accumulates thousands of files. A file is only marked processed after a successful copy, so a failed transfer is retried automatically on the next run rather than silently getting skipped.
- **Time budget**: each run checks elapsed time against `maxRunMillis` (5 minutes) so it never runs into Apps Script's hard 6-minute execution ceiling; anything left over rolls to the next scheduled run.
- **Error handling** is two-tiered: a whole-pair failure (bad folder ID, no access) is caught so one broken creator doesn't take down the run for the other four; a single-file failure is caught, logged, and the file is left unmarked so it retries.
- **Optional Sheet logging** (`logTransfer_`) appends Timestamp / Filename / File ID / Source / Destination / Status rows and writes a header row on first use — but this is a no-op if `logSheetId` is blank.
- **Optional email alerts** (`sendAlert_`) via `MailApp` — a no-op if `alertEmail` is blank.
- `createTrigger()` is a one-time helper that installs (or reinstalls, deleting any duplicate first) the 5-minute time-driven trigger on `syncAllFolders`.
- `markExistingAsProcessed()` is a one-time helper for going live without ingesting the existing backlog — it marks every file currently in each source folder as already-done without copying it, so only uploads from that point forward get synced.

## How the five creator pairs got filled in

After the script was written with placeholder config, the user supplied the real folder links piecemeal over several messages, and Claude tracked them in a running table as they arrived: June and Marissa's source folders first ("Just remember these till I got the destination ones"), then Emma's and a claimed "Sofi" link that turned out to be an exact duplicate of Emma's URL — Claude caught this immediately, flagged it as an evident copy-paste slip, and asked for Sofi's real link and confirmation these were sources rather than destinations, rather than silently wiring in a duplicate. The user then sent Sofi's correct folder, and later added a fifth creator, Bella Leah. Once all five destination links arrived in one message, Claude confirmed the topology (one destination per creator, not one shared central folder) and wired all five pairs into `CONFIG` in a single edit.

Final config (`Code.gs`) has five pairs: June, Marissa, Emma, Sofi, and Bella Leah, each with distinct source and destination folder IDs.

## Decisions made along the way

- **Alerts and log sheet: both left off.** When asked to finalize the remaining optional settings (alert email, log sheet, backlog handling, subfolders), the user said "no need. I just want the creators to add the content in the first folder, and then I can just handle it after." Claude then explicitly blanked out `alertEmail` (rather than leaving the placeholder `"your@email.com"`, which would otherwise have tried and failed to mail a bogus address) and left `logSheetId` empty. Failures are still visible in the Apps Script Executions view if ever needed, just not proactively surfaced.
- **Backlog handling**: left as default (copies whatever's already sitting in the source folders on first run) since the user didn't ask to skip it. `markExistingAsProcessed` remains available if that's ever wanted later.
- **Subfolders**: left `includeSubfolders: false` (flat folders only) — not raised as a concern by the user.

## Deploy walkthrough (support given live)

Because Apps Script deploys under the user's own Google account, Claude could not do the actual deploy — only write the code and talk the user through the console. The transcript shows a fairly hands-on walkthrough:

- Initial confusion when the editor showed "Unsaved changes" and "No functions" in the run dropdown — resolved by explaining this just meant the paste hadn't been saved yet (Cmd+S fixes it and repopulates the function list).
- Confusion navigating between the `Code.gs` view and the `appsscript.json` manifest view (the Run/Debug toolbar disappears while viewing the manifest, which is expected — manifest files aren't runnable).
- The user ran `syncAllFolders` and got "Execution completed" with no `[SUCCESS]` log lines — Claude explained this correctly meant the source folders were simply empty at that point, not an error.
- The user got stuck finding "the function dropdown" in the UI — Claude gave a precise visual description of its position (top toolbar, between Debug and Execution log) to unblock them.
- After running `createTrigger`, the log showed `Trigger installed: syncAllFolders every 5 minutes.` — confirmed live and fully automated at that point, with the note that it runs on Google's servers so the tab/laptop can be closed.

At the point this thread's drive-folder-sync work concluded, the automation was reported live and working: creators drop files into their source folder, and within about 5 minutes each file lands in that creator's destination folder with the original filename intact, never duplicated. The user then pivoted the same session to a different project (a Reddit Viability Scorer tool), so nothing further about drive-folder-sync was discussed in that thread after go-live.

## Current status (from what's on disk today)

The `drive-folder-sync/` folder in this repo currently contains just the three deliverables: `Code.gs`, `appsscript.json`, and `README.md` — matching exactly what the transcript describes being built and finalized. There's no local test harness or CI for it (by design — it's a Google-hosted script, not something this repo runs), so "done" here means "deployed and confirmed live in the Apps Script console," per the last transcript update.

## Gaps / things not covered in the transcripts

Across all other session logs in this project's history, "drive-folder-sync" appears only in passing — mostly as a line in `git status`/`ls` output while Claude was working on unrelated bots (shift-downtime-monitor, whale-intel, etc.) in the same repo, confirming the folder exists on disk but with no further discussion of its logic or status. There is no dedicated project-memory note for this tool (unlike some other projects in this repo), and no transcript evidence of:
- Whether the five folder-ID pairs above are still the live/correct ones, or whether creators or folder structures have changed since June 9.
- Any post-launch bug reports, failed transfers, or quota issues.
- Whether the log sheet or alert email were ever turned back on later.

If any of that has changed since, it happened outside what these local transcripts capture, and should be treated as unknown rather than assumed.
