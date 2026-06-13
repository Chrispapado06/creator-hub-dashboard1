// Server-side WhatsApp ping for tasks, via the Meta WhatsApp Cloud API.
//
// The browser can't hold the WhatsApp token, so the client POSTs the message
// here and THIS function forwards it. Peer to api/discord-notify.js.
//
// IMPORTANT: business-initiated WhatsApp messages (outside the 24h customer
// service window) MUST use an approved message TEMPLATE — you can't send free
// text. So this sends a template with a single body variable (the message).
//
// Vercel env vars (Project → Settings → Environment Variables):
//   WHATSAPP_TOKEN          — permanent access token (System User token)
//   WHATSAPP_PHONE_ID       — the WhatsApp Business phone-number ID (not the number)
//   WHATSAPP_TEMPLATE       — approved template name (e.g. "task_ping")
//   WHATSAPP_TEMPLATE_LANG  — template language code (default "en")
//   WHATSAPP_NOTIFY_SECRET  — optional shared secret (x-task-notify-secret)
//
// Template shape it expects: one BODY with a single {{1}} variable, e.g.
//   "🔔 Task update: {{1}}"
//
// Always responds 200 (best-effort) — a failed send must never break the
// caller, whose DB change already committed.

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TEMPLATE = process.env.WHATSAPP_TEMPLATE;
const LANG = process.env.WHATSAPP_TEMPLATE_LANG || "en";
const SECRET = process.env.WHATSAPP_NOTIFY_SECRET;

// Strip everything but digits — WhatsApp wants E.164 without the leading +.
function normalizePhone(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      configured: Boolean(TOKEN && PHONE_ID && TEMPLATE),
    });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (SECRET && req.headers["x-task-notify-secret"] !== SECRET) {
    return res.status(401).json({ ok: false, error: "bad secret" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const to = normalizePhone(body && body.phone);
  const content = (body && body.content ? String(body.content) : "").slice(0, 900);

  if (!to || !content) {
    return res.status(200).json({ ok: false, error: "missing phone or content" });
  }
  if (!TOKEN || !PHONE_ID || !TEMPLATE) {
    console.error("[whatsapp-notify] not configured (TOKEN/PHONE_ID/TEMPLATE)");
    return res.status(200).json({ ok: false, error: "whatsapp not configured" });
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: content }] },
      ],
    },
  };

  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error(`[whatsapp-notify] ${r.status}: ${text.slice(0, 300)}`);
      return res.status(200).json({ ok: false, error: `whatsapp ${r.status}` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[whatsapp-notify] fetch failed:", e && e.message);
    return res.status(200).json({ ok: false, error: "fetch failed" });
  }
}
