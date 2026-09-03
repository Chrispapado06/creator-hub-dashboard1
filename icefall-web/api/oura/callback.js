import { handleOuraCallback } from "../_oura.mjs";
import { ipFrom, methodGuard, noStore } from "./_transport.mjs";

/**
 * GET /api/oura/callback — production transport. THE OAUTH REDIRECT TARGET.
 *
 * This exact URL is what OURA_REDIRECT_URI must be set to, and what is
 * registered on the Oura application. Oura matches it exactly, so the value in
 * the environment and the value in their dashboard have to be the same string,
 * down to the trailing slash.
 *
 * All behaviour lives in `_oura.mjs`. A 302 out of the handler is a redirect to
 * an allowlisted URL only — see the note there on open redirects.
 */
export default async function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  noStore(res);

  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());

  const { status, headers, body } = await handleOuraCallback(query, {
    env: process.env,
    ip: ipFrom(req),
  });

  if (headers?.Location) {
    res.setHeader("Location", headers.Location);
    return res.status(status).end();
  }
  return res.status(status).json(body);
}
