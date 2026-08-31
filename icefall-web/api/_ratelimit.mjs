/**
 * Per-IP, in-memory, fixed-window rate limiting — shared by every public endpoint.
 *
 * This was written once inside `_waitlist.mjs` and is now used by the support
 * intake too. It is extracted rather than copied for the reason this codebase
 * keeps relearning: `peaks.ts` exists because one summit altitude lived in two
 * places and disagreed, and `RealBusiness.tsx` exists because a guard lived in
 * one component while the claim was rendered by three. A second copy of a limiter
 * with subtly different constants is the same shape of bug, just quieter.
 *
 * ── HONEST ABOUT WHAT THIS IS ───────────────────────────────────────────────
 * A serverless function runs many instances and this map is per-instance, so it
 * slows a naive flood and does not stop a determined one. Real protection is the
 * database's own constraints plus whatever sits in front of the deployment. It
 * costs nothing, and it is exactly correct locally, where there is one instance.
 *
 * Each caller gets its own bucket, so a visitor filling in the waitlist does not
 * spend the allowance for writing to support. That separation is the reason the
 * window and ceiling are arguments rather than module constants.
 */

const BUCKETS = new Map();

/** Crude ceiling on total tracked IPs. This map is not a database. */
const MAX_TRACKED = 5000;

/**
 * @param {string} bucket  a name per endpoint — separate allowances
 * @param {string} ip      caller address; falsy means "cannot tell", so allow
 * @param {object} opts    { windowMs, max }
 * @returns {boolean}      true when this request should be refused
 */
export function rateLimited(bucket, ip, { windowMs = 60_000, max = 8 } = {}, now = Date.now()) {
  if (!ip) return false;

  let hits = BUCKETS.get(bucket);
  if (!hits) {
    hits = new Map();
    BUCKETS.set(bucket, hits);
  }

  const hit = hits.get(ip);
  if (!hit || now - hit.start > windowMs) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > MAX_TRACKED) hits.clear();
    return false;
  }

  hit.n += 1;
  return hit.n > max;
}
