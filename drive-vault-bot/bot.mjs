#!/usr/bin/env node
// Drive → OnlyFans vault sync bot.
//
// Runs every 5 minutes via GitHub Actions. For each creator in
// DRIVE_MAP it walks that model's Drive folder AND every subfolder
// inside it (e.g. named "script" folders), and for each new photo/video:
//   1. Downloads the file's bytes from Drive.
//   2. Uploads them to that creator's OnlyFans vault via the OF API.
//   3. Records the Drive file id in state.json so it's never uploaded
//      again. Files are left exactly where you put them — your folder
//      organisation is untouched.
//
// A file is only marked done AFTER a successful vault upload, so a
// transient failure just means it's retried on the next run.
//
// Auth: a Google service account (GOOGLE_SERVICE_ACCOUNT_JSON secret).
// Each model shares their folder with the service account's email as
// Viewer (read-only is enough now that we never move files). See README.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import {
  DRIVE_MAP,
  MAX_BYTES,
  MAX_FILES_PER_CREATOR_PER_RUN,
  MAX_FOLDER_DEPTH,
  ALLOWED_MIME_PREFIXES,
  uploadToVault,
  sendTelegram,
  escHtml,
} from "./config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(HERE, "state.json");

// ── State ──────────────────────────────────────────────────────────
async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_PATH, "utf8")); }
  catch { return { processed: {} }; }
}
async function saveState(s) {
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

// ── Google Drive client ────────────────────────────────────────────
function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing");
  let creds;
  try { creds = JSON.parse(raw); }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"); }
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const isAllowed = (mime) =>
  !!mime && ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));

// Walk a folder and ALL its subfolders (script folders), collecting
// every uploadable photo/video. Depth-guarded so a stray shortcut loop
// can't spin forever. Each returned file carries the path of folder
// names it was found under, purely for nicer logging.
async function listMediaRecursive(drive, folderId, trail = [], depth = 0, acc = []) {
  if (depth > MAX_FOLDER_DEPTH) {
    console.warn(`  · max depth reached under ${trail.join("/") || "(root)"} — not descending further`);
    return acc;
  }
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime)",
      orderBy: "createdTime",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        await listMediaRecursive(drive, f.id, [...trail, f.name], depth + 1, acc);
      } else if (isAllowed(f.mimeType)) {
        acc.push({ ...f, trail: trail.join("/") });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return acc;
}

// Download a Drive file's bytes into a Buffer.
async function downloadBytes(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data);
}

async function main() {
  if (!process.env.ONLYFANSAPI_KEY) {
    console.error("ONLYFANSAPI_KEY missing");
    process.exit(1);
  }
  const drive = driveClient();
  const state = await loadState();
  state.processed ??= {};

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const c of DRIVE_MAP) {
    if (!c.folder_id || c.folder_id.startsWith("REPLACE_")) {
      console.warn(`· ${c.name}: folder_id not configured — skipping`);
      continue;
    }

    let media;
    try {
      media = await listMediaRecursive(drive, c.folder_id);
      // Oldest first across the whole tree, so content posts in order.
      media.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
    } catch (e) {
      console.warn(`· ${c.name}: list failed — ${e.message}`);
      continue;
    }

    const pending = media.filter((f) => !state.processed[f.id]);
    if (pending.length === 0) continue;

    console.log(`· ${c.name}: ${pending.length} new file(s) across folders`);

    const batch = pending.slice(0, MAX_FILES_PER_CREATOR_PER_RUN);
    for (const f of batch) {
      const where = f.trail ? `${f.trail}/${f.name}` : f.name;
      const size = Number(f.size || 0);
      if (size > MAX_BYTES) {
        // Over OnlyFans' 1 GB hard limit — no upload method can take it.
        // Record it so it's flagged ONCE, not re-reported every 5 min.
        console.warn(`  ✗ ${where}: ${(size / 1e9).toFixed(2)} GB exceeds OnlyFans' 1 GB limit — skipped`);
        skipped++;
        failures.push(`${c.name}: <code>${escHtml(where)}</code> too large (${(size / 1e9).toFixed(2)} GB) — over OnlyFans' 1 GB limit; compress it or post manually`);
        state.processed[f.id] = {
          name: f.name,
          folder: f.trail || "(root)",
          creator: c.name,
          account_id: c.account_id,
          skipped_reason: "exceeds_1gb",
          recorded_at: new Date().toISOString(),
        };
        await saveState(state);
        continue;
      }
      try {
        const bytes = await downloadBytes(drive, f.id);
        // Drive sometimes omits `size` in metadata; re-check against the real
        // bytes so a >1 GB file can't slip past the pre-download guard and
        // then retry (re-downloading) every run forever.
        if (bytes.length > MAX_BYTES) {
          console.warn(`  ✗ ${where}: ${(bytes.length / 1e9).toFixed(2)} GB exceeds OnlyFans' 1 GB limit — skipped`);
          skipped++;
          failures.push(`${c.name}: <code>${escHtml(where)}</code> too large (${(bytes.length / 1e9).toFixed(2)} GB) — over OnlyFans' 1 GB limit; compress it or post manually`);
          state.processed[f.id] = {
            name: f.name, folder: f.trail || "(root)", creator: c.name,
            account_id: c.account_id, skipped_reason: "exceeds_1gb", recorded_at: new Date().toISOString(),
          };
          await saveState(state);
          continue;
        }
        const r = await uploadToVault(c.account_id, bytes, f.name, f.mimeType);
        // Media reached the vault → record it so it's never re-uploaded,
        // even if the staging-post cleanup below failed.
        state.processed[f.id] = {
          name: f.name,
          folder: f.trail || "(root)",
          creator: c.name,
          account_id: c.account_id,
          vault_media_id: r.mediaId ?? null,
          uploaded_at: new Date().toISOString(),
        };
        uploaded++;
        if (!r.deleted) {
          // Media is in the vault, but the throwaway scheduled post could
          // not be deleted. It's scheduled ~10 months out (cannot publish
          // meanwhile), but a human should remove it. Flag it loudly.
          console.warn(`  ⚠️ ${where}: in vault, but staging post ${r.postId} NOT deleted (${r.deleteError}) — remove it manually`);
          failures.push(`${c.name}: ⚠️ <code>${escHtml(where)}</code> is in the vault, but staging post <code>${r.postId}</code> couldn't be deleted — delete it manually in OnlyFans`);
        } else {
          console.log(`  ✓ ${where} → vault (media ${r.mediaId})`);
        }
        // Persist after every file so a mid-run crash never re-uploads.
        await saveState(state);
      } catch (e) {
        failed++;
        failures.push(`${c.name}: <code>${escHtml(where)}</code> — ${escHtml(e.message)}`);
        console.warn(`  ✗ ${where}: ${e.message}`);
        // Not recorded → retried next run. File stays exactly where it is.
      }
    }
  }

  await saveState(state);

  console.log(`Done. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);

  // Optional Telegram summary — only when something noteworthy happened.
  if (uploaded > 0 || failures.length > 0) {
    const lines = [
      "📤 <b>Drive → Vault sync</b>",
      `Uploaded: <b>${uploaded}</b>` + (skipped ? ` · Skipped: ${skipped}` : "") + (failed ? ` · Failed: ${failed}` : ""),
    ];
    if (failures.length) lines.push("", "<b>Needs attention:</b>", ...failures.slice(0, 10));
    await sendTelegram(lines.join("\n"));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
