// Server-side Discord ping for the task-handoff pipeline.
//
// The browser cannot hold the Discord webhook URL (it would ship in the
// bundle), so the client POSTs the message here and THIS function — running
// on Vercel with the secret in process.env — forwards it to Discord.
//
// Peer to api/outreach-bot.js. Self-contained on purpose (no cross-dir
// imports) so Vercel bundling can never break it.
//
// Vercel env vars (Project → Settings → Environment Variables):
//   DISCORD_TASK_WEBHOOK_URL   — a Discord channel "incoming webhook" URL
//   DISCORD_TASK_NOTIFY_SECRET — optional shared secret; if set, requests
//                                must send it as x-task-notify-secret
//
// Always responds 200 (best-effort): a failed Discord post must never break
// the caller, because the DB handoff has already committed by the time this
// is called.

const WEBHOOK_URL = process.env.DISCORD_TASK_WEBHOOK_URL;
const SECRET = process.env.DISCORD_TASK_NOTIFY_SECRET;

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Health check — confirms the env var is wired without leaking it.
    return res.status(200).json({ ok: true, configured: Boolean(WEBHOOK_URL) });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (SECRET && req.headers["x-task-notify-secret"] !== SECRET) {
    return res.status(401).json({ ok: false, error: "bad secret" });
  }

  // Vercel parses JSON bodies automatically; fall back to manual parse.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const content = (body && body.content ? String(body.content) : "").slice(0, 1900);
  const mentionUserIds = Array.isArray(body && body.mentionUserIds)
    ? body.mentionUserIds.filter(Boolean).map(String)
    : [];

  if (!content) {
    return res.status(200).json({ ok: false, error: "empty content" });
  }
  if (!WEBHOOK_URL) {
    // Not configured — ack so the app doesn't error, but report it.
    console.error("[discord-notify] DISCORD_TASK_WEBHOOK_URL is not set");
    return res.status(200).json({ ok: false, error: "webhook not configured" });
  }

  // allowed_mentions scoped to ONLY the intended users — never @everyone/roles.
  const payload = {
    content,
    allowed_mentions: { parse: [], users: mentionUserIds },
  };

  try {
    const r = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error(`[discord-notify] Discord ${r.status}: ${text.slice(0, 200)}`);
      return res.status(200).json({ ok: false, error: `discord ${r.status}` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[discord-notify] fetch failed:", e && e.message);
    return res.status(200).json({ ok: false, error: "fetch failed" });
  }
}
