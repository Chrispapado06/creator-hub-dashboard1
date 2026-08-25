import { handleWaitlist } from "./_waitlist.mjs";

/**
 * POST /api/waitlist — production transport.
 *
 * All behaviour lives in `_waitlist.mjs`, which the local dev server runs too.
 * This file's only job is Vercel's request/response shape.
 */
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Vercel parses JSON bodies, but not when the client sends an odd
  // content-type — so accept a string too rather than throwing on it.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim();

  const { status, body: payload } = await handleWaitlist(body, { env: process.env, ip });
  return res.status(status).json(payload);
}
