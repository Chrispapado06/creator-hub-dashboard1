import { handleOuraWebhook, handleOuraWebhookVerify } from "../_oura.mjs";
import { methodGuard, noStore } from "./_transport.mjs";

/**
 * /api/oura/webhook — production transport. THE PUBLIC CALLBACK URL.
 *
 * GET   Oura's one-time verification handshake when a subscription is created.
 * POST  one event notification, signed.
 *
 * ── WHY THE BODY PARSER IS OFF ──────────────────────────────────────────────
 *
 * The signature is an HMAC over the bytes Oura sent. Vercel's parser turns
 * those bytes into an object and throws the bytes away; re-serialising the
 * object is not guaranteed to reproduce them, because key order and whitespace
 * are not part of JSON's contract. So the raw body is read here and the parse
 * happens after, and `_oura.mjs` verifies against the raw form first.
 *
 * This is also the only reason this file is longer than its siblings. All
 * behaviour still lives in `_oura.mjs`, which the local dev server runs too.
 *
 * ── ONE STATUS CODE TO NEVER RETURN ─────────────────────────────────────────
 *
 * 410 cancels the subscription at Oura's end, for the whole application rather
 * than for one person. Nothing in this path returns it.
 */
export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;

/**
 * The bytes, however this platform chose to hand them over.
 *
 * `config.api.bodyParser = false` above is the documented way to keep the raw
 * stream, and it is what should happen. THIS FUNCTION DOES NOT ASSUME IT
 * WORKED. If a platform version ignores the flag, the stream is already
 * consumed and reading it would return an empty string — which the signature
 * check would then correctly refuse, and every real webhook would be rejected
 * in production while passing in development. That is precisely the drift the
 * shared-module pattern exists to prevent, so all four shapes are handled:
 *
 *   nothing parsed  read the stream, which is the intended path
 *   Buffer          the bytes, already read
 *   string          the bytes, already decoded
 *   object          the bytes are GONE. `_oura.mjs` then verifies against a
 *                   re-serialised body, which is Oura's own stated scheme and
 *                   works unless something reordered the keys.
 *
 * @returns {Promise<{raw: string, exact: boolean} | null>} null means too large.
 */
async function readRaw(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.length > MAX_BODY_BYTES ? null : { raw: req.body.toString("utf8"), exact: true };
  }
  if (typeof req.body === "string") {
    return req.body.length > MAX_BODY_BYTES ? null : { raw: req.body, exact: true };
  }
  if (req.body && typeof req.body === "object") {
    // Parsed by the platform despite the config. Say so rather than pretending
    // the re-serialised form is what arrived.
    return { raw: "", exact: false };
  }

  return new Promise((resolve) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      if (tooBig) return;
      data += chunk;
      // The documented event body is five short fields. Anything approaching
      // this size is not one, and reading it would be the only way to find out.
      if (data.length > MAX_BODY_BYTES) {
        tooBig = true;
        data = "";
      }
    });
    req.on("end", () => resolve(tooBig ? null : { raw: data, exact: true }));
    req.on("error", () => resolve({ raw: "", exact: false }));
  });
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["GET", "POST"])) return;
  noStore(res);

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const { status, body } = handleOuraWebhookVerify(
      Object.fromEntries(url.searchParams.entries()),
      { env: process.env },
    );
    return res.status(status).json(body);
  }

  const read = await readRaw(req);
  if (read === null) return res.status(413).json({ ok: false, error: "body too large" });

  let parsed = read.exact ? null : req.body;
  if (read.exact && read.raw) {
    try {
      parsed = JSON.parse(read.raw);
    } catch {
      // Left null on purpose. A body that is not JSON cannot be a signed Oura
      // event, and the signature check refuses it without needing to guess.
    }
  }

  const { status, body } = await handleOuraWebhook({
    env: process.env,
    rawBody: read.raw,
    parsedBody: parsed,
    headers: req.headers,
  });
  return res.status(status).json(body);
}
