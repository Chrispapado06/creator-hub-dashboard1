/**
 * Remove the directories that must never reach a deployment.
 *
 * WHY THIS EXISTS AND NOT JUST .vercelignore.
 *
 * Both `public/img/operators/` and `public/img/guides/` are listed in
 * `.gitignore` and, since 2026-09-04, in `.vercelignore` too. Neither stopped
 * them. Measured against four separate deployments on 2026-09-04 — including
 * one built with `--force` to defeat the build cache — every file was still
 * served with HTTP 200 at a guessable path:
 *
 *   /img/operators/ee.png    Elite Exped's trademark
 *   /img/operators/p14.png   14 Peaks Expedition's trademark
 *   /img/operators/ac.png    Adventure Consultants' trademark
 *   /img/operators/sst.png   Seven Summit Treks' trademark
 *   /img/guides/CREDITS.md   a public file naming all eight invented guides
 *
 * Two comments in the source asserted the directories were "gitignored AND
 * vercelignored, so a mark stays on the machine it was put on and reaches no
 * build". The second half was false for months.
 *
 * So the guarantee is enforced HERE, at the end of the build, where it is
 * deterministic and does not depend on how any host decides to collect files.
 * `vite build` copies `public/` into `dist/`; this deletes the two directories
 * back out of `dist/` afterwards, and FAILS THE BUILD if it cannot, because a
 * silent no-op is exactly how this survived four deployments.
 *
 * Nothing breaks: `CompanyMark` renders a monogram when a logo path is missing
 * and `GuidePortrait` renders initials. That is what a fresh clone has always
 * shown, because the files are not in the repository.
 */
import { rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** Directories that carry third-party trademarks or invented-person imagery. */
const FORBIDDEN = ["img/operators", "img/guides"];

let removed = 0;
for (const rel of FORBIDDEN) {
  const dir = join(DIST, rel);
  try {
    await access(dir);
  } catch {
    continue; // never copied on this machine — fine, that is the goal state
  }
  await rm(dir, { recursive: true, force: true });
  try {
    await access(dir);
    console.error(`[strip-local-assets] FAILED to remove dist/${rel}`);
    process.exit(1);
  } catch {
    console.log(`[strip-local-assets] removed dist/${rel}`);
    removed += 1;
  }
}
console.log(`[strip-local-assets] ${removed} forbidden director${removed === 1 ? "y" : "ies"} removed from dist/`);
