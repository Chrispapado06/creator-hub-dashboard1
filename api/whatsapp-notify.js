// Server-side WhatsApp ping for tasks. Supports two providers:
//   • Meta WhatsApp Cloud API  (PREFERRED — used when WHATSAPP_PHONE_NUMBER_ID
//                                + WHATSAPP_TOKEN are set)
//   • Twilio WhatsApp           (fallback — used when only TWILIO_* are set)
//
// WhatsApp's 24-hour rule (Meta's, not ours): free text only delivers within 24h
// of the person's last inbound message. For always-on "it's your turn" pings you
// need an APPROVED TEMPLATE. Set WHATSAPP_TEMPLATE_NAME (a template with ONE body
// variable {{1}}) and we send it as a template with the message as that variable;
// otherwise we send plain text (delivers only inside the 24h window).
//
// Vercel env vars (Project → Settings → Environment Variables):
//   Meta:   WHATSAPP_PHONE_NUMBER_ID  (WhatsApp → API Setup → "Phone number ID")
//           WHATSAPP_TOKEN            (access token; temp for testing, permanent via System User)
//           WHATSAPP_TEMPLATE_NAME    (optional approved template, 1 body var)
//           WHATSAPP_TEMPLATE_LANG    (optional, default "en_US")
//   Twilio: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / TWILIO_CONTENT_SID
//   WHATSAPP_NOTIFY_SECRET           (optional shared secret, x-task-notify-secret)
//
// Always responds 200 (best-effort) — a failed send must never break the caller.

const META_PNID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_TOKEN = process.env.WHATSAPP_TOKEN;
const META_TEMPLATE = process.env.WHATSAPP_TEMPLATE_NAME;
const META_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";

const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_FROM_RAW = process.env.TWILIO_WHATSAPP_FROM || "";
const TW_CONTENT_SID = process.env.TWILIO_CONTENT_SID;

const SECRET = process.env.WHATSAPP_NOTIFY_SECRET;

// Meta wants bare E.164 digits (no +, no "whatsapp:").
function digits(raw) {
  return String(raw || "").replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");
}
// Twilio wants "whatsapp:+<E.164>".
function toWhatsapp(raw) {
  let s = String(raw || "").trim().replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (!s.startsWith("+")) s = `+${s}`;
  return `whatsapp:${s}`;
}
const TW_FROM = toWhatsapp(TW_FROM_RAW);

const metaReady = Boolean(META_PNID && META_TOKEN);
const twilioReady = Boolean(TW_SID && TW_TOKEN && TW_FROM);

async function sendMeta(toDigits, content) {
  const payload = META_TEMPLATE
    ? {
        messaging_product: "whatsapp", to: toDigits, type: "template",
        template: {
          name: META_TEMPLATE,
          language: { code: META_TEMPLATE_LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: content }] }],
        },
      }
    : { messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: content } };

  const r = await fetch(`https://graph.facebook.com/v21.0/${META_PNID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    let msg = `meta ${r.status}`;
    try { const j = JSON.parse(t); if (j.error && j.error.message) msg = j.error.message; } catch { /* keep status */ }
    throw new Error(msg);
  }
}

async function sendTwilio(toWa, content) {
  const params = new URLSearchParams();
  params.append("From", TW_FROM);
  params.append("To", toWa);
  if (TW_CONTENT_SID) {
    params.append("ContentSid", TW_CONTENT_SID);
    params.append("ContentVariables", JSON.stringify({ "1": content }));
  } else {
    params.append("Body", content);
  }
  const auth = Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: params.toString(),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    let msg = `twilio ${r.status}`;
    try { const j = JSON.parse(t); if (j.message) msg = j.message; } catch { /* keep status */ }
    throw new Error(msg);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      configured: metaReady || twilioReady,
      provider: metaReady ? "meta" : twilioReady ? "twilio" : null,
      template: metaReady ? Boolean(META_TEMPLATE) : Boolean(TW_CONTENT_SID),
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
  const content = (body && body.content ? String(body.content) : "").slice(0, 1500);
  const phoneRaw = body && body.phone;
  if (!phoneRaw || !content) {
    return res.status(200).json({ ok: false, error: "missing phone or content" });
  }

  try {
    if (metaReady) {
      await sendMeta(digits(phoneRaw), content);
      return res.status(200).json({ ok: true, provider: "meta" });
    }
    if (twilioReady) {
      await sendTwilio(toWhatsapp(phoneRaw), content);
      return res.status(200).json({ ok: true, provider: "twilio" });
    }
    return res.status(200).json({ ok: false, error: "whatsapp not configured (set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_TOKEN, or Twilio vars)" });
  } catch (e) {
    console.error("[whatsapp-notify]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
