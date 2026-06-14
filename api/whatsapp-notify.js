// Server-side WhatsApp ping for tasks, via Twilio.
//
// Twilio's WhatsApp Sandbox lets you send messages with NO Meta business
// verification and NO template approval — each recipient just sends the
// sandbox "join <code>" message once. Peer to api/discord-notify.js.
//
// The browser can't hold the Twilio auth token, so the client POSTs here and
// THIS function forwards it to Twilio's Messages API.
//
// Vercel env vars (Project → Settings → Environment Variables):
//   TWILIO_ACCOUNT_SID   — from the Twilio Console dashboard
//   TWILIO_AUTH_TOKEN    — from the Twilio Console dashboard
//   TWILIO_WHATSAPP_FROM — sandbox sender, e.g. "whatsapp:+14155238886"
//                          (or your approved WhatsApp sender for production)
//   WHATSAPP_NOTIFY_SECRET — optional shared secret (x-task-notify-secret)
//
// Always responds 200 (best-effort) — a failed send must never break the
// caller, whose DB change already committed.

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_RAW = process.env.TWILIO_WHATSAPP_FROM || "";
const SECRET = process.env.WHATSAPP_NOTIFY_SECRET;

// Normalize any phone-ish string to whatsapp:+digits — strips spaces, brackets,
// dashes and an existing "whatsapp:" prefix, so "whatsapp:+1 (415) 523-8886"
// and "+357 99129355" both work.
function toWhatsapp(raw) {
  let s = String(raw || "").trim().replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (!s.startsWith("+")) s = `+${s}`;
  return `whatsapp:${s}`;
}

// Twilio wants "whatsapp:+<E.164>" for the sender too — clean it the same way.
const FROM = toWhatsapp(FROM_RAW);

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: Boolean(SID && TOKEN && FROM) });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (SECRET && req.headers["x-task-notify-secret"] !== SECRET) {
    return res.status(401).json({ ok: false, error: "bad secret" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const to = toWhatsapp(body && body.phone);
  const content = (body && body.content ? String(body.content) : "").slice(0, 1500);

  if (!to || !content) {
    return res.status(200).json({ ok: false, error: "missing phone or content" });
  }
  if (!SID || !TOKEN || !FROM) {
    console.error("[whatsapp-notify] not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM)");
    return res.status(200).json({ ok: false, error: "twilio not configured" });
  }

  const params = new URLSearchParams();
  params.append("From", FROM);
  params.append("To", to);
  params.append("Body", content);

  const auth = Buffer.from(`${SID}:${TOKEN}`).toString("base64");

  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: params.toString(),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      // Twilio returns a JSON error with a "message" — surface it for debugging.
      let msg = `twilio ${r.status}`;
      try { const j = JSON.parse(text); if (j.message) msg = j.message; } catch { /* keep status */ }
      console.error(`[whatsapp-notify] ${r.status}: ${text.slice(0, 300)}`);
      return res.status(200).json({ ok: false, error: msg });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[whatsapp-notify] fetch failed:", e && e.message);
    return res.status(200).json({ ok: false, error: "fetch failed" });
  }
}
