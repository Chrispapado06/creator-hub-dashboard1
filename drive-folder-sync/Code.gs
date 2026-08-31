/**
 * Drive Folder Sync — auto-copy new uploads from creator source folders
 * into a centralised agency destination folder.
 *
 * Runs on a 5-minute time-driven trigger. For each source→dest pair it finds
 * files added since the last successful run, copies them (original filename
 * preserved), records processed file IDs so nothing is ever copied twice, and
 * optionally logs every transfer to a Google Sheet. Failures are logged and
 * emailed, then the script moves on to the next file.
 */

const CONFIG = {
  pairs: [
    { sourceFolderId: "1dta0rGxYpMARsNIO3KyNmdF6a0zm0eJs", destFolderId: "1o3Layi97rHHVCTVxuZD2HUHZ2SHgjsx2", creatorName: "June" },
    { sourceFolderId: "1HnE5SgXhexRGa5Rhw6unoAn8ncimPpAe", destFolderId: "1p21r5aCLj-LsO1rYkCSfBivdccLDoNhz", creatorName: "Marissa" },
    { sourceFolderId: "1CVnZ-Wc_nvy2WLKbO_STEv0FlUMI_Z6F", destFolderId: "1ivzThxSKc_z3ZGhZMe2kCpXxh9DcDsey", creatorName: "Emma" },
    { sourceFolderId: "1UeDGw2ksDyqdJ4SYgFJnMvJMRHsLETj4", destFolderId: "1dQxx-5-e3fZRH5bQlLXYCPzdBrUJ4NTk", creatorName: "Sofi" },
    { sourceFolderId: "1O7MYOhbmxad0jEZ-vuK0R3H3CyBUo6ej", destFolderId: "18vAw1erf_ensrdy3-SfaQytB_NxsZ5oz", creatorName: "Bella Leah" }
  ],
  logSheetId: "",            // optional: a Google Sheet ID for the transfer log ("" to disable)
  alertEmail: "",            // alerts disabled — failures still log to View → Executions
  includeSubfolders: false,  // set true to recurse into subfolders of each source
  maxRunMillis: 5 * 60 * 1000 // safety cap (~5 min) so we never exceed Apps Script's 6-min limit
};

const PROP_PREFIX = "synced:"; // PropertiesService key per source folder

/**
 * Main entry point — point your time-driven trigger here.
 */
function syncAllFolders() {
  const startedAt = Date.now();
  const props = PropertiesService.getScriptProperties();

  CONFIG.pairs.forEach(function (pair) {
    if (!pair.sourceFolderId || !pair.destFolderId) {
      Logger.log("Skipping pair with missing folder ID: " + JSON.stringify(pair));
      return;
    }
    try {
      syncPair_(pair, props, startedAt);
    } catch (err) {
      // A pair-level failure (e.g. bad folder ID / no access) shouldn't kill the run.
      logTransfer_({
        filename: "(folder-level error)",
        fileId: "",
        source: pair.creatorName || pair.sourceFolderId,
        dest: pair.destFolderId,
        status: "ERROR: " + err.message
      });
      sendAlert_(pair, "(folder access)", err.message);
    }
  });
}

/**
 * Sync a single source→dest pair.
 */
function syncPair_(pair, props, startedAt) {
  const sourceFolder = DriveApp.getFolderById(pair.sourceFolderId);
  const destFolder = DriveApp.getFolderById(pair.destFolderId);

  const key = PROP_PREFIX + pair.sourceFolderId;
  const processed = loadProcessedSet_(props, key);

  const files = collectFiles_(sourceFolder, CONFIG.includeSubfolders);

  let changed = false;
  for (let i = 0; i < files.length; i++) {
    // Respect the time budget — leftover files are picked up next run.
    if (Date.now() - startedAt > CONFIG.maxRunMillis) {
      Logger.log("Time budget reached; deferring remaining files to next run.");
      break;
    }

    const file = files[i];
    const fileId = file.getId();
    if (processed[fileId]) continue; // already transferred

    const filename = file.getName();
    try {
      file.makeCopy(filename, destFolder);
      processed[fileId] = true;
      changed = true;
      logTransfer_({
        filename: filename,
        fileId: fileId,
        source: pair.creatorName || pair.sourceFolderId,
        dest: pair.destFolderId,
        status: "SUCCESS"
      });
    } catch (err) {
      logTransfer_({
        filename: filename,
        fileId: fileId,
        source: pair.creatorName || pair.sourceFolderId,
        dest: pair.destFolderId,
        status: "ERROR: " + err.message
      });
      sendAlert_(pair, filename, err.message);
      // Do NOT mark as processed — we'll retry it next run.
    }
  }

  if (changed) saveProcessedSet_(props, key, processed);
}

/**
 * Gather files from a folder (optionally recursing into subfolders).
 */
function collectFiles_(folder, recurse) {
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) out.push(it.next());

  if (recurse) {
    const folders = folder.getFolders();
    while (folders.hasNext()) {
      const sub = folders.next();
      collectFiles_(sub, true).forEach(function (f) { out.push(f); });
    }
  }
  return out;
}

/**
 * Processed-file tracking via ScriptProperties.
 * Stored as a JSON map of { fileId: true }. Property values cap at 9 KB, so we
 * shard across multiple keys (key, key:1, key:2, ...) once a chunk gets large.
 */
function loadProcessedSet_(props, key) {
  const merged = {};
  let idx = 0;
  while (true) {
    const k = idx === 0 ? key : key + ":" + idx;
    const raw = props.getProperty(k);
    if (raw === null) break;
    try {
      const obj = JSON.parse(raw);
      for (const id in obj) merged[id] = true;
    } catch (e) {
      Logger.log("Corrupt property for " + k + ", ignoring: " + e.message);
    }
    idx++;
  }
  return merged;
}

function saveProcessedSet_(props, key, set) {
  // Clear any previous shards first to avoid orphans.
  let idx = 0;
  while (props.getProperty(idx === 0 ? key : key + ":" + idx) !== null) {
    props.deleteProperty(idx === 0 ? key : key + ":" + idx);
    idx++;
  }

  // Re-shard. ~8 KB per shard keeps us safely under the 9 KB value limit.
  const ids = Object.keys(set);
  const MAX_BYTES = 8000;
  let shard = {};
  let shardIdx = 0;
  let size = 2; // "{}"

  ids.forEach(function (id) {
    const add = id.length + 7; // rough: "id":true,
    if (size + add > MAX_BYTES) {
      writeShard_(props, key, shardIdx, shard);
      shardIdx++;
      shard = {};
      size = 2;
    }
    shard[id] = true;
    size += add;
  });
  writeShard_(props, key, shardIdx, shard);
}

function writeShard_(props, key, shardIdx, shard) {
  const k = shardIdx === 0 ? key : key + ":" + shardIdx;
  props.setProperty(k, JSON.stringify(shard));
}

/**
 * Append a row to the optional log sheet. No-op if logSheetId is blank.
 * Columns: Timestamp | Filename | File ID | Source | Destination | Status
 */
function logTransfer_(entry) {
  Logger.log("[" + entry.status + "] " + entry.filename + " (" + entry.source + ")");
  if (!CONFIG.logSheetId) return;
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.logSheetId).getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Filename", "File ID", "Source", "Destination", "Status"]);
    }
    sheet.appendRow([new Date(), entry.filename, entry.fileId, entry.source, entry.dest, entry.status]);
  } catch (e) {
    Logger.log("Failed to write log sheet: " + e.message);
  }
}

/**
 * Email alert on a failed transfer.
 */
function sendAlert_(pair, filename, errorMessage) {
  if (!CONFIG.alertEmail) return;
  try {
    MailApp.sendEmail({
      to: CONFIG.alertEmail,
      subject: "[Drive Sync] Transfer failed — " + (pair.creatorName || pair.sourceFolderId),
      body: [
        "A file failed to transfer.",
        "",
        "Creator/source: " + (pair.creatorName || pair.sourceFolderId),
        "Source folder ID: " + pair.sourceFolderId,
        "Destination folder ID: " + pair.destFolderId,
        "File: " + filename,
        "Error: " + errorMessage,
        "",
        "The script will retry this file on the next run."
      ].join("\n")
    });
  } catch (e) {
    Logger.log("Failed to send alert email: " + e.message);
  }
}

/**
 * One-time helper: installs the 5-minute trigger. Run this once manually.
 * Safe to re-run — it removes any existing syncAllFolders triggers first.
 */
function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "syncAllFolders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncAllFolders")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("Trigger installed: syncAllFolders every 5 minutes.");
}

/**
 * Optional one-time helper: marks ALL files currently in the source folders as
 * already-processed WITHOUT copying them. Run this once if you only want to
 * sync files uploaded from now on (skip the existing backlog).
 */
function markExistingAsProcessed() {
  const props = PropertiesService.getScriptProperties();
  CONFIG.pairs.forEach(function (pair) {
    if (!pair.sourceFolderId) return;
    const folder = DriveApp.getFolderById(pair.sourceFolderId);
    const set = {};
    collectFiles_(folder, CONFIG.includeSubfolders).forEach(function (f) { set[f.getId()] = true; });
    saveProcessedSet_(props, PROP_PREFIX + pair.sourceFolderId, set);
    Logger.log("Marked " + Object.keys(set).length + " existing files processed for " + (pair.creatorName || pair.sourceFolderId));
  });
}
