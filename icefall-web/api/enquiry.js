import { handleEnquiry } from "./_enquiry.mjs";

/**
 * POST /api/enquiry — production transport.
 *
 * All behaviour lives in `_enquiry.mjs`, which the local dev server runs too.
 * This file's only job is Vercel's request/response shape. Identical in
 * structure to `waitlist.js` on purpose — see the note in `_enquiry.mjs`.
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

  const { status, body: payload } = await handleEnquiry(body, { env: process.env, ip });
  return res.status(status).json(payload);
}
