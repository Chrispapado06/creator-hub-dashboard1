import { rateLimited } from "./_ratelimit.mjs";

/**
 * A commercial enquiry, from a visitor with no account.
 *
 * Transport-agnostic, like `_waitlist.mjs` and `_support.mjs`, because there are
 * two transports and they must not drift:
 *
 *   api/enquiry.js       Vercel serverless function  — production
 *   server/index.mjs     the local node API server   — `npm run dev:all`
 *
 * ── WHY THIS IS NOT `open_enquiry` ──────────────────────────────────────────
 *
 * The signed-in apps call `open_enquiry`, which derives the sender from
 * `auth.uid()`. `icefall-web` has no Supabase auth session, and the function is
 * granted to `authenticated` only — so it is unreachable from here by design,
 * not by omission. A visitor writes straight into `enquiries` under the anon
 * insert policy, exactly as the support intake does.
 *
 * ── WHAT THE ANON POLICY DEMANDS ────────────────────────────────────────────
 *
 *     sender_id is null and sender_kind = 'visitor' and sender_email is not null
 *
 * That last clause is a product rule wearing a constraint's clothes: an
 * anonymous enquiry must carry a way to answer it, or it is a message nobody
 * can reply to. So the form asks for an email and this refuses without one.
 *
 * ── PUBLISHABLE KEY ONLY ────────────────────────────────────────────────────
 *
 * Same reasoning as support, and the stake is higher: `enquiries` is a
 * commercial pipeline. Anon has INSERT and no SELECT, so the worst an attacker
 * holding this environment can do is add rows — they cannot read anybody's
 * enquiry, nor the staff answers attached to them.
 *
 * `Prefer: return=minimal` is mandatory rather than tidy. PostgREST returns the
 * inserted row by default, which needs SELECT; anon has none, so without the
 * header the insert succeeds and then fails on the read back, and a visitor is
 * told their enquiry did not send when it did. Session 03's tests found the
 * same thing independently.
 *
 * ── THE OBJECT IS THE POINT ─────────────────────────────────────────────────
 *
 * `enquiries_has_object` requires a product, a destination or a company. An
 * enquiry with no object is a support message and belongs in the other queue.
 *
 * ONLY DESTINATIONS ARE ACCEPTED HERE, and that is deliberate. `destinations`
 * is seeded from this app's own catalogue, so a trek or a mountain resolves to
 * a real row. Trips and companies in `icefall-web` are invented client-side
 * with slug ids — they are not rows in `products` or `companies`, so an
 * enquiry naming one cannot be filed. The foreign key is doing exactly what it
 * should: **a fabricated lead in a commercial queue is worse than no lead.**
 * When companies are real, add the kind here; do not route around the key.
 */

const EMAIL_MAX = 254;
const NAME_MAX = 80;
const LABEL_MAX = 200;
const SCREEN_MAX = 200;

/**
 * Matched to `enquiries_body_len` exactly: 10–4000 after trimming.
 *
 * NOT the support intake's 20 — that table has its own rule and this one is
 * looser. Copying the neighbouring number would refuse something the product
 * allows.
 */
const BODY_MIN = 10;
const BODY_MAX = 4000;

/** Same rule as the waitlist and support. See the note there on why it is permissive. */
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/** `destinations.id` is a slug — the check constraint on the table is this shape. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Reads config at call time, not module load — serverless envs land late. */
function supabaseConfig(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
  return url && key ? { url, key } : null;
}

export function enquiryConfigured(env) {
  return Boolean(supabaseConfig(env));
}

/* -- validation ------------------------------------------------------------ */

export function validate(body) {
  const raw = body && typeof body === "object" ? body : {};

  // Honeypot, same shape and same name as the support form's.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { trap: true };
  }

  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address so the answer can reach you." };
  if (email.length > EMAIL_MAX) return { error: "That email address is too long." };
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like an email address." };

  const message = String(raw.body ?? "").trim();
  if (!message) return { error: "Write your enquiry." };
  if (message.length < BODY_MIN) {
    return { error: `Please add a little more — at least ${BODY_MIN} characters.` };
  }
  if (message.length > BODY_MAX) {
    return { error: `That enquiry is too long. Please keep it under ${BODY_MAX} characters.` };
  }

  /*
   * The object. Only `destination` today — see the header.
   *
   * `objectLabel` is the object's name as this app knows it, stored beside the
   * key so that `on delete set null` cannot turn an old enquiry into "about
   * nothing". Note the database does NOT currently verify the label against the
   * referenced row on the anon path — `open_enquiry` resolves it from the
   * record, the anon policy does not — so this sends the true name from the
   * catalogue rather than anything a caller supplied. Session 03 is moving that
   * guarantee into a trigger so it belongs to the table.
   */
  if (raw.objectKind !== "destination") {
    return {
      error: "That enquiry has nothing to be about.",
      log: `unsupported objectKind: ${String(raw.objectKind).slice(0, 40)}`,
    };
  }
  const destinationId = String(raw.objectId ?? "").trim();
  if (!SLUG_RE.test(destinationId)) return { error: "That enquiry has nothing to be about." };

  const objectLabel = String(raw.objectLabel ?? "").trim().slice(0, LABEL_MAX);
  if (!objectLabel) return { error: "That enquiry has nothing to be about." };

  let name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);

  /*
   * `origin_screen` is TRIAGE, NEVER AUTHORITY (support contract, Session 04's
   * correction). It records where somebody was standing so a question is
   * actionable. It is not a statement of what they are asking for, and the desk
   * must never read it as one.
   */
  const originScreen = String(raw.originScreen ?? "").trim().slice(0, SCREEN_MAX);

  return {
    value: {
      sender_kind: "visitor",
      sender_email: email,
      sender_name: name || null,
      origin_app: "web",
      origin_screen: originScreen || null,
      destination_id: destinationId,
      object_label: objectLabel,
      body: message,
    },
  };
}

/* -- the store ------------------------------------------------------------- */

async function insertSupabase(entry, cfg) {
  const res = await fetch(`${cfg.url}/rest/v1/enquiries`, {
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
  let code = "";
  try {
    code = JSON.parse(text).code || "";
  } catch {
    /* not JSON — the raw text is enough for the log */
  }
  const err = new Error(`supabase ${res.status}: ${text.slice(0, 300)}`);
  err.pgCode = code;
  throw err;
}

/* -- the endpoint ---------------------------------------------------------- */

export async function handleEnquiry(body, { env = {}, ip = "" } = {}) {
  // Tighter than the waitlist's eight. An enquiry is a considered message about
  // a specific objective; nobody legitimately sends four in a minute.
  if (rateLimited("enquiry", ip, { windowMs: 60_000, max: 4 })) {
    return { status: 429, body: { ok: false, error: "Too many enquiries. Try again in a minute." } };
  }

  const checked = validate(body);

  // The honeypot was filled in. Look exactly like success.
  if (checked.trap) return { status: 200, body: { ok: true, sent: true } };
  if (checked.error) {
    if (checked.log) console.error("[enquiry]", checked.log);
    return { status: 400, body: { ok: false, error: checked.error } };
  }

  const cfg = supabaseConfig(env);
  if (!cfg) {
    console.error(
      "[enquiry] not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on this deployment",
    );
    return {
      status: 503,
      body: {
        ok: false,
        code: "not_configured",
        error: "Enquiries aren't connected yet, so this hasn't been sent. Nothing was lost.",
      },
    };
  }

  try {
    await insertSupabase(checked.value, cfg);
    return { status: 200, body: { ok: true, sent: true } };
  } catch (err) {
    console.error("[enquiry] store failed:", err);

    /*
     * PGRST205 — the table is not in the schema cache, i.e. the migration has
     * not been pushed. Distinguished from a real failure because it is the one
     * the owner can act on, and because telling somebody "try again" about a
     * thing that cannot work until a migration runs is a false instruction.
     */
    if (err.pgCode === "PGRST205") {
      return {
        status: 503,
        body: {
          ok: false,
          code: "not_ready",
          error: "Enquiries aren't switched on yet, so this hasn't been sent. Nothing was lost.",
        },
      };
    }

    return {
      status: 502,
      body: { ok: false, error: "We couldn't send that just now. Please try again." },
    };
  }
}
