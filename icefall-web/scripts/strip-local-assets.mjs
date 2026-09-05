/**
 * Remove the directories that must never reach a deployment.
 *
 * THE SAME GUARANTEE AS icefall-app/scripts/strip-local-assets.mjs, AND HERE
 * FOR THE SAME REASON — it was missing, and the files were live.
 *
 * Measured 2026-09-04, unauthenticated, on the public waitlist site:
 *   https://icefall-web.vercel.app/img/guides/guide-demo-lama.jpg
 *     → 200, image/jpeg, 17,806 bytes
 * and the same for all eight generated portraits. These are computer-generated
 * faces of guides who do not exist. `.gitignore` carried the directory;
 * `.vercelignore` did not, and `vercel` deploys the local working directory
 * rather than git, so every build copied them out to a guessable public path.
 *
 * `.vercelignore` alone was measured NOT to stop this on the phone app — three
 * deployments, one with --force to defeat the build cache, still served the
 * files. So the guarantee is enforced here, at the end of the build, where it
 * is deterministic. It FAILS the build if it cannot delete, because a silent
 * no-op is how this survived in the first place.
 */
import { rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const FORBIDDEN = ["img/guides", "img/operators"];

let removed = 0;
for (const rel of FORBIDDEN) {
  const dir = join(DIST, rel);
  try { await access(dir); } catch { continue; }
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
