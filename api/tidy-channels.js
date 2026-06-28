// Admin-triggered one-shot channel tidy (the "Tidy channels & resend" button).
//
// The browser can't hold the CRON_SECRET, so the button POSTs the current admin's
// username here. We VERIFY that username is a real admin in access_codes (server
// side, same consistency-guard pattern the app's RPCs use), and only then trigger
// the digest's clean+repost using the server-side CRON_SECRET. The client never
// sees any secret, and a non-admin caller is rejected.
//
// Body: { username }. Always responds 200 with the digest result (or an error).

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Returns { ok, why } so a failure tells us EXACTLY what went wrong.
async function checkAdmin(username) {
  if (!SB_URL) return { ok: false, why: "server missing VITE_SUPABASE_URL" };
  if (!SB_KEY) return { ok: false, why: "server missing VITE_SUPABASE_ANON_KEY" };
  if (!username) return { ok: false, why: "no username in session" };
  const u = encodeURIComponent(username);
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/access_codes?username=eq.${u}&select=account_type,active`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
  } catch (e) { return { ok: false, why: `lookup network error: ${String((e && e.message) || e)}` }; }
  if (!r.ok) return { ok: false, why: `lookup failed ${r.status}` };
  const rows = await r.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, why: `no account_codes row for username "${username}"` };
  // Admin = any non-staff active account (matches the app's `account_type ?? "admin"`).
  const admin = rows.some((x) => x && x.account_type !== "staff" && x.active !== false);
  return admin
    ? { ok: true }
    : { ok: false, why: `account "${username}" is not admin (account_type=${rows.map((x) => x.account_type).join("/")})` };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = body && body.username ? String(body.username) : "";

  const chk = await checkAdmin(username);
  if (!chk.ok) {
    return res.status(401).json({ ok: false, error: chk.why });
  }

  const host = req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  try {
    const r = await fetch(`${proto}://${host}/api/discord-digest?clean=1`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET || "" },
    });
    const j = await r.json().catch(() => ({}));
    return res.status(200).json(j);
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
