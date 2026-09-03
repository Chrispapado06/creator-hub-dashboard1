import { handleOuraSummary } from "../_oura.mjs";
import { bearerFrom, ipFrom, methodGuard, noStore } from "./_transport.mjs";

/**
 * GET /api/oura/summary — production transport.
 *
 * All behaviour lives in `_oura.mjs`, which the local dev server runs too.
 * Note there is no elevated credential anywhere in this path: the read runs on
 * the caller's own Supabase token.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  noStore(res);
  const { status, body } = await handleOuraSummary({
    env: process.env,
    ip: ipFrom(req),
    bearer: bearerFrom(req),
  });
  return res.status(status).json(body);
}
