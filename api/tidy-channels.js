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

async function isAdmin(username) {
  if (!username || !SB_URL || !SB_KEY) return false;
  const u = encodeURIComponent(username);
  const r = await fetch(`${SB_URL}/rest/v1/access_codes?username=eq.${u}&select=account_type,active`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  // Admin = any non-staff account (matches the app's `account_type ?? "admin"`,
  // so a NULL account_type — e.g. the owner — counts as admin).
  return Array.isArray(rows) && rows.some((x) => x && x.account_type !== "staff" && x.active !== false);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = body && body.username ? String(body.username) : "";

  if (!username) {
    return res.status(401).json({ ok: false, error: "no username in session — sign out and back in" });
  }
  if (!(await isAdmin(username))) {
    return res.status(401).json({ ok: false, error: `not recognised as an admin (user: ${username})` });
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
