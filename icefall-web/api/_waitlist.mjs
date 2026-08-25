/**
 * The waitlist — the one thing icefall.app does before launch.
 *
 * This module holds the whole behaviour: validation, rate limiting and the
 * store. It is transport-agnostic on purpose, because there are two transports
 * and they must not be allowed to drift:
 *
 *   api/waitlist.js      Vercel serverless function  — production
 *   server/index.mjs     the local node API server   — `npm run dev:all`
 *
 * Both do nothing but hand the request here and forward `{status, body}` back.
 * A bug found in dev is therefore the same bug that was in production.
 *
 * ── THE STORE ───────────────────────────────────────────────────────────────
 * Supabase, reached over PostgREST with the PUBLISHABLE (anon) key and an
 * INSERT-ONLY row-level-security policy — deliberately not the service-role
 * key. This table is a list of customers' email addresses. With the anon key
 * and no SELECT policy, the worst an attacker who obtains this environment can
 * do is add rows; they cannot read the list. A service-role key would hand them
 * every address in the database, and it would buy us nothing here.
 *
 * `Prefer: return=minimal` matters for the same reason: PostgREST returns the
 * inserted row by default, which needs a SELECT policy we intentionally do not
 * have.
 *
 * If Supabase is not configured, the endpoint says so rather than pretending —
 * see `not_configured` below. A signup form that swallows an address and
 * reports success is worse than one that admits it is not connected.
 */

const EMAIL_MAX = 254;
const NAME_MAX = 80;

/**
 * Deliberately permissive but not decorative: one @, a dot in the domain, no
 * whitespace, no angle brackets. Anything stricter starts rejecting real
 * addresses, and the address is confirmed by us actually emailing it later.
 */
const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/** Reads config at call time, not module load — serverless envs land late. */
function supabaseConfig(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
  return url && key ? { url, key } : null;
}

export function waitlistConfigured(env) {
  return Boolean(supabaseConfig(env) || env.WAITLIST_FILE);
}

/* -- validation ------------------------------------------------------------ */

export function validate(body) {
  const raw = body && typeof body === "object" ? body : {};

  // Honeypot. A field named `company` is hidden from people and irresistible to
  // the simpler bots. Filled in => accept the request and drop it on the floor,
  // so the bot has nothing to learn from the response.
  if (typeof raw.company === "string" && raw.company.trim() !== "") {
    return { trap: true };
  }

  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };
  if (email.length > EMAIL_MAX) return { error: "That email address is too long." };
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like an email address." };

  let name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX);

  const source = ["hero", "footer", "header"].includes(raw.source) ? raw.source : "unknown";

  return { value: { email, name: name || null, source } };
}

/* -- rate limiting --------------------------------------------------------- */

/**
 * Per-IP, in memory, fixed window.
 *
 * Honest about what this is: a serverless function has many instances and this
 * map is per-instance, so it slows a naive flood and does not stop a determined
 * one. Real protection is the unique index on `email` plus whatever sits in
 * front of the deployment. It costs nothing and it is the correct behaviour
 * locally, where there is exactly one instance.
 */
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

function rateLimited(ip, now) {
  if (!ip) return false;
  const hit = HITS.get(ip);
  if (!hit || now - hit.start > WINDOW_MS) {
    HITS.set(ip, { start: now, n: 1 });
    if (HITS.size > 5000) HITS.clear(); // crude ceiling; this map is not a database
    return false;
  }
  hit.n += 1;
  return hit.n > MAX_PER_WINDOW;
}

/* -- stores ---------------------------------------------------------------- */

async function insertSupabase(entry, cfg) {
  const res = await fetch(`${cfg.url}/rest/v1/waitlist`, {
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

  if (res.ok) return { duplicate: false };

  // 23505 = unique_violation. Someone already signed up with this address, which
  // is a success from the visitor's point of view, not an error.
  const text = await res.text().catch(() => "");
  if (res.status === 409 || text.includes("23505")) return { duplicate: true };

  throw new Error(`supabase ${res.status}: ${text.slice(0, 300)}`);
}

/**
 * Local development only. Vercel's filesystem is ephemeral, so this is never
 * the production store — `WAITLIST_FILE` is set by `server/index.mjs`, and by
 * nothing else.
 */
async function insertFile(entry, path) {
  const { appendFile, readFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  await mkdir(dirname(path), { recursive: true });

  const existing = await readFile(path, "utf8").catch(() => "");
  for (const line of existing.split("\n")) {
    if (!line.trim()) continue;
    try {
      if (JSON.parse(line).email === entry.email) return { duplicate: true };
    } catch {
      /* a half-written line is not a reason to reject a signup */
    }
  }

  await appendFile(path, JSON.stringify(entry) + "\n", "utf8");
  return { duplicate: false };
}

/* -- the endpoint ---------------------------------------------------------- */

/**
 * @param {object} body   parsed JSON request body
 * @param {object} ctx    { env, ip }
 * @returns {Promise<{status: number, body: object}>}
 */
export async function handleWaitlist(body, { env = {}, ip = "" } = {}) {
  if (rateLimited(ip, Date.now())) {
    return { status: 429, body: { ok: false, error: "Too many attempts. Try again in a minute." } };
  }

  const checked = validate(body);

  // The honeypot was filled in. Look exactly like success.
  if (checked.trap) return { status: 200, body: { ok: true, joined: true } };
  if (checked.error) return { status: 400, body: { ok: false, error: checked.error } };

  const entry = { ...checked.value, created_at: new Date().toISOString() };
  const cfg = supabaseConfig(env);

  try {
    const result = cfg
      ? await insertSupabase(entry, cfg)
      : env.WAITLIST_FILE
        ? await insertFile(entry, env.WAITLIST_FILE)
        : null;

    if (result === null) {
      // Configured by nobody. Say so — do not accept an address into a void.
      console.error(
        "[waitlist] not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY on this deployment",
      );
      return {
        status: 503,
        body: {
          ok: false,
          code: "not_configured",
          error: "The waitlist isn't connected yet. Please try again shortly.",
        },
      };
    }

    return { status: 200, body: { ok: true, joined: true, already: result.duplicate } };
  } catch (err) {
    console.error("[waitlist] store failed:", err);
    return {
      status: 502,
      body: { ok: false, error: "We couldn't save that just now. Please try again." },
    };
  }
}
