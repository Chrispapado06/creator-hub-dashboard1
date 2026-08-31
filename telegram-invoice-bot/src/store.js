// Read/write access to creators.json.
//
// The file is re-read from disk on every operation, so hand-edits to
// creators.json take effect immediately without restarting the bot. Writes are
// done in place (not via atomic rename) so they work with a single-file Docker
// bind mount; a .bak copy is written before each save as a safety net.

import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function dataFile() {
  if (process.env.DATA_FILE) return process.env.DATA_FILE;
  return fileURLToPath(new URL('./creators.json', import.meta.url));
}

export function getDataFile() {
  return dataFile();
}

export function loadCreators() {
  const raw = readFileSync(dataFile(), 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('creators.json must be a JSON array of creator objects');
  }
  return data;
}

export function saveCreators(creators) {
  const file = dataFile();
  if (existsSync(file)) {
    try {
      copyFileSync(file, file + '.bak');
    } catch {
      // backup is best-effort; never block a save on it
    }
  }
  // Atomic write: write a temp file in the same directory, then rename over the
  // target. Avoids a truncation window on crash and works with a directory bind
  // mount (the rename stays on one filesystem and propagates to the host).
  const tmp = join(dirname(file), `.creators.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(creators, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}
