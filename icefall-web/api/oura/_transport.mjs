/**
 * The four lines every Oura Vercel function would otherwise repeat.
 *
 * Shared for the reason `_ratelimit.mjs` gives: a second copy of the bearer
 * parser, with the header name spelled slightly differently, is the drift this
 * codebase keeps paying for. Nothing here decides anything — the decisions are
 * all in `_oura.mjs`, which the local dev server runs too.
 */

/** The caller's Supabase access token, or "" — never a default identity. */
export function bearerFrom(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : "";
}

export function ipFrom(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  return (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
}

/** Vercel parses JSON, but not for an odd content-type. Accept a string too. */
export function jsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

export function methodGuard(req, res, allowed) {
  const list = `${allowed.join(", ")}, OPTIONS`;
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", list);
    res.status(204).end();
    return false;
  }
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", list);
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return false;
  }
  return true;
}

/**
 * A health payload must not be cached by anything between here and the phone.
 * `no-store` rather than `no-cache`: the second still permits a copy on disk.
 */
export function noStore(res) {
  res.setHeader("Cache-Control", "no-store, private");
}
