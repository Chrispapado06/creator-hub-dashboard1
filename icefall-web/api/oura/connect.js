import { handleOuraConnect } from "../_oura.mjs";
import { bearerFrom, ipFrom, jsonBody, methodGuard, noStore } from "./_transport.mjs";

/**
 * POST /api/oura/connect — production transport.
 *
 * All behaviour lives in `_oura.mjs`, which the local dev server runs too.
 * This file's only job is Vercel's request/response shape.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  noStore(res);
  const { status, body } = await handleOuraConnect(jsonBody(req), {
    env: process.env,
    ip: ipFrom(req),
    bearer: bearerFrom(req),
  });
  return res.status(status).json(body);
}
