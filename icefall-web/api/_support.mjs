import { rateLimited } from "./_ratelimit.mjs";

/**
 * Support, for a visitor who has no account and cannot get one.
 *
 * This module holds the whole behaviour: validation, rate limiting and the
 * store. It is transport-agnostic on purpose, because there are two transports
 * and they must not be allowed to drift:
 *
 *   api/support.js       Vercel serverless function  — production
 *   server/index.mjs     the local node API server   — `npm run dev:all`
 *
 * Both do nothing but hand the request here and forward `{status, body}` back.
 * A bug found in dev is therefore the same bug that was in production. This is
 * the waitlist's shape, deliberately — see `_waitlist.mjs`.
 *
 * ── WHY THIS IS NOT THE RPC EVERY OTHER APP USES ────────────────────────────
 *
 * The signed-in apps call `open_support_ticket`, which derives who is asking
 * from `auth.uid()` and stamps it on the ticket. `icefall-web`'s public site has
 * no accounts and no Supabase auth session, so there is no `auth.uid()` to
 * derive anything from. A visitor therefore writes to `support_intake`, which
 * staff triage into real tickets.
 *
 * ── THE KEY, AND WHY IT MATTERS MORE HERE THAN ON THE WAITLIST ──────────────
 *
 * PUBLISHABLE (anon) key only, against an INSERT-ONLY table with NO SELECT
 * POLICY. Never the service-role key.
 *
 * On the waitlist the stake was a list of email addresses. Here it is every
 * support ticket in the business **and every internal staff note attached to
 * them** — notes written on the assumption that the person who raised the
 * ticket will never see them. A service-role key in this function would hand
 * all of that to anyone who obtained this environment, and it would buy nothing:
 * an insert is all this endpoint has ever needed to do.
 *
 * `Prefer: return=minimal` is mandatory for the same reason. PostgREST returns
 * the inserted row by default, which requires a SELECT policy that deliberately
 * does not exist — so without it the insert succeeds and then fails on the read
 * back, and a visitor is told their message did not send when it did.
 *
 * ── WHAT COMES BACK, AND WHAT MUST NOT BE INVENTED ──────────────────────────
 *
 * Nothing. `return=minimal` means no row, so there is NO REFERENCE for the
 * anonymous path — the `ICE-000107` reference belongs to a real ticket created
 * by the RPC, and intake rows are not tickets yet. Do not generate one to make
 * the confirmation feel more solid: a reference a visitor cannot quote to
 * anybody is a fabricated receipt.
 *
 * What a 2xx does prove is that the row was written, so "sent" is a true word
 * to use. That is the whole claim, and it is enough.
 */

const EMAIL_MAX = 254;
const NAME_MAX = 80;
const SUBJECT_MAX = 200;

/**
 * The database enforces 20–4000 on `body`. These match it exactly rather than
 * approximately: a client-side rule looser than the database's produces a
 * rejection the visitor cannot act on, and one that is stricter silently
 * forbids something the product allows.
 */
const BODY_MIN = 20;
const BODY_MAX = 4000;

/** Same rule as the waitlist — see the note there on why it is permissive. */
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/** Reads config at call time, not module load — serverless envs land late. */
function supabaseConfig(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
  return url && key ? { url, key } : null;
}

export function supportConfigured(env) {
  return Boolean(supabaseConfig(env));
}

/* -- validation ------------------------------------------------------------ */

export function validate(body) {
  const raw = body && typeof body === "object" ? body : {};

  /*
   * Honeypot, named `website` rather than the waitlist's `company`.
   *
   * Not a gratuitous difference: a support form is a plausible place to ask
   * which company someone is with, so a hidden field called `company` here
   * would be a trap that a future developer might reasonably fill in for real.
   * `website` is asked for by nothing on this form.
   */
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { trap: true };
  }

  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address so we can reply." };
  if (email.length > EMAIL_MAX) return { error: "That email address is too long." };
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like an email address." };

  const subject = String(raw.subject ?? "").trim().replace(/\s+/g, " ");
  if (!subject) return { error: "Add a subject." };
  if (subject.length > SUBJECT_MAX) return { error: "That subject is too long." };

  const message = String(raw.body ?? "").trim();
  if (!message) return { error: "Write your message." };
  if (message.length < BODY_MIN) {
    return { error: `Please add a little more — at least ${BODY_MIN} characters.` };
  }
  if (message.length > BODY_MAX) {
    return { error: `That message is too long. Please keep it under ${BODY_MAX} characters.` };
  }

  let name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);

  return { value: { email, name: name || null, subject, body: message } };
}

/* -- the store ------------------------------------------------------------- */

async function insertSupabase(entry, cfg) {
  const res = await fetch(`${cfg.url}/rest/v1/support_intake`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      // No SELECT policy exists for anon — do not ask PostgREST to read it back.
      Prefer: "return=minimal",
    },
    body: JSON.stringify(entry),
  });

  if (res.ok) return;

  const text = await res.text().catch(() => "");
  throw new Error(`supabase ${res.status}: ${text.slice(0, 300)}`);
}

/* -- the endpoint ---------------------------------------------------------- */

/**
 * @param {object} body   parsed JSON request body
 * @param {object} ctx    { env, ip }
 * @returns {Promise<{status: number, body: object}>}
 */
export async function handleSupport(body, { env = {}, ip = "" } = {}) {
  /*
   * A tighter allowance than the waitlist's eight.
   *
   * A person writing to support sends one message, reads the reply, and might
   * send a second. Nobody legitimately sends four in a minute, and each one is
   * up to 4,000 characters rather than an email address.
   */
  if (rateLimited("support", ip, { windowMs: 60_000, max: 4 })) {
    return { status: 429, body: { ok: false, error: "Too many messages. Try again in a minute." } };
  }

  const checked = validate(body);

  // The honeypot was filled in. Look exactly like success, so the bot learns
  // nothing from the response.
  if (checked.trap) return { status: 200, body: { ok: true, sent: true } };
  if (checked.error) return { status: 400, body: { ok: false, error: checked.error } };

  const cfg = supabaseConfig(env);

  if (!cfg) {
    /*
     * Not connected. Say so, and say it as a failure.
     *
     * The alternative — accepting the message and reporting success — is the
     * exact failure the support contract calls out: "a form that takes a
     * message, shows a reference and drops it into memory is worse than no
     * button, because the person believes they have been heard." A person with
     * a safety question about a mountain is entitled to know we did not get it.
     */
    console.error(
      "[support] not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on this deployment",
    );
    return {
      status: 503,
      body: {
        ok: false,
        code: "not_configured",
        /*
         * DELIBERATELY NAMES NO ALTERNATIVE ADDRESS. The obvious sentence here
         * is "please email support@icefall.app" — and the support contract
         * records that `icefall-app` already shipped a button pointing at that
         * mailbox, which has nothing behind it. Sending someone from a form that
         * does not work to an inbox nobody reads is not a fallback, it is the
         * same failure twice. When there is a monitored address, put it here.
         */
        error: "Support isn't connected yet, so this hasn't been sent. Nothing was lost — please try again later.",
      },
    };
  }

  try {
    await insertSupabase(checked.value, cfg);
    return { status: 200, body: { ok: true, sent: true } };
  } catch (err) {
    console.error("[support] store failed:", err);
    return {
      status: 502,
      body: { ok: false, error: "We couldn't send that just now. Please try again." },
    };
  }
}
