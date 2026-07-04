// AI applicant screener. Polls new Typeform responses, scores each against the
// configured requirements with Claude, stores them, and (fully-automatic) posts
// a message to the team's Telegram hiring channel when a candidate passes.
//
// Triggered by: the cron (Authorization: Bearer <CRON_SECRET>) OR the admin's
// "Screen now" button (POST { username } — verified against access_codes).
//
// Env (Vercel): TYPEFORM_TOKEN, OUTREACH_BOT_TOKEN (reused Telegram bot),
//   CRON_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.
//   The Anthropic key + form id + telegram chat id come from the DB (settings).

const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const TYPEFORM_TOKEN = process.env.TYPEFORM_TOKEN;
const TG_TOKEN = process.env.HIRING_BOT_TOKEN || process.env.OUTREACH_BOT_TOKEN;

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  return r.ok ? r.json() : [];
}
async function sbWrite(method, path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return r.ok;
}
async function isAdmin(username) {
  if (!username || !SB_URL || !SB_KEY) return false;
  const rows = await sbGet(`access_codes?username=eq.${encodeURIComponent(username)}&select=account_type,active`);
  return Array.isArray(rows) && rows.some((x) => x && x.account_type !== "staff" && x.active !== false);
}

// ── Typeform ─────────────────────────────────────────────────────────────────
function answerValue(a) {
  switch (a.type) {
    case "text": case "long_text": return a.text;
    case "email": return a.email;
    case "number": return String(a.number);
    case "boolean": return a.boolean ? "Yes" : "No";
    case "choice": return a.choice && (a.choice.label || a.choice.other);
    case "choices": return ((a.choices && a.choices.labels) || []).join(", ");
    case "phone_number": return a.phone_number;
    case "url": return a.url;
    case "date": return a.date;
    default: return a.text || "";
  }
}
function pick(qa, ...needles) {
  const hit = qa.find((x) => needles.some((n) => (x.q || "").toLowerCase().includes(n)));
  return hit ? hit.a : null;
}

// ── Claude ───────────────────────────────────────────────────────────────────
async function screen(apiKey, requirements, qa) {
  const system = 'You are a strict but fair hiring screener for a marketing agency. Score how well the candidate meets the ROLE REQUIREMENTS. Reply with ONLY compact JSON, no prose: {"score": <integer 0-100>, "verdict": "pass"|"maybe"|"no", "reason": "<one or two sentences>"}. Use "pass" only when they clearly meet the requirements.';
  const user = `ROLE REQUIREMENTS:\n${requirements}\n\nCANDIDATE APPLICATION:\n${qa.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n\n")}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`claude ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const j = await r.json();
  const text = (j.content && j.content[0] && j.content[0].text) || "";
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? JSON.parse(m[0]) : {};
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const verdict = ["pass", "maybe", "no"].includes(parsed.verdict) ? parsed.verdict : (score >= 70 ? "pass" : score >= 45 ? "maybe" : "no");
  return { score, verdict, reason: String(parsed.reason || "").slice(0, 500) };
}

async function tgSend(chatId, html) {
  if (!TG_TOKEN || !chatId) return false;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  const cronOk = CRON_SECRET && (req.headers.authorization === `Bearer ${CRON_SECRET}` || req.headers["x-cron-secret"] === CRON_SECRET);
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const adminOk = !cronOk && (await isAdmin(body && body.username));
  if (!cronOk && !adminOk) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!SB_URL || !SB_KEY) return res.status(200).json({ ok: false, error: "supabase not configured" });

  try {
    const cfg = (await sbGet("hiring_config?id=eq.1&select=*"))[0] || {};
    const requirements = cfg.requirements;
    const formId = cfg.typeform_form_id;
    const minScore = Number(cfg.min_score ?? 70);
    const tgChat = cfg.telegram_chat_id;
    const apiKey = ((await sbGet("agency_settings?select=anthropic_api_key"))[0] || {}).anthropic_api_key;

    if (!formId || !TYPEFORM_TOKEN) return res.status(200).json({ ok: false, error: "set the Typeform form id (Applicants → settings) + TYPEFORM_TOKEN env" });
    if (!requirements) return res.status(200).json({ ok: false, error: "add your hiring requirements first" });
    if (!apiKey) return res.status(200).json({ ok: false, error: "no Anthropic key in agency settings" });

    // Form field titles.
    const form = await fetch(`https://api.typeform.com/forms/${formId}`, { headers: { Authorization: `Bearer ${TYPEFORM_TOKEN}` } }).then((r) => (r.ok ? r.json() : null));
    const titleById = {};
    for (const f of ((form && form.fields) || [])) titleById[f.id] = f.title;

    // Responses.
    const resp = await fetch(`https://api.typeform.com/forms/${formId}/responses?page_size=200&completed=true`, { headers: { Authorization: `Bearer ${TYPEFORM_TOKEN}` } });
    if (!resp.ok) return res.status(200).json({ ok: false, error: `typeform ${resp.status}` });
    const items = (await resp.json()).items || [];

    const seen = new Set((await sbGet("applicants?select=response_id")).map((a) => a.response_id));
    let screened = 0, passed = 0, messaged = 0;

    for (const item of items) {
      const token = item.token || item.response_id || item.landing_id;
      if (!token || seen.has(token)) continue;
      const qa = (item.answers || []).map((a) => ({ q: titleById[a.field && a.field.id] || (a.field && a.field.ref) || "?", a: answerValue(a) || "" }));
      if (qa.length === 0) continue;

      let verdict = "maybe", score = 0, reason = "";
      try { ({ verdict, score, reason } = await screen(apiKey, requirements, qa)); }
      catch (e) { reason = `screening failed: ${e.message}`; }

      const name = pick(qa, "name") || "Applicant";
      const email = pick(qa, "email") || (qa.find((x) => /@/.test(x.a)) || {}).a || null;
      const telegram = pick(qa, "telegram") || null;
      const role = pick(qa, "role", "position") || null;

      await sbWrite("POST", "applicants", {
        response_id: token, name, email, telegram, role, answers: qa,
        ai_verdict: verdict, ai_score: score, ai_reason: reason,
        submitted_at: item.submitted_at || null,
      });
      screened++;
      seen.add(token);

      const isPass = verdict === "pass" || score >= minScore;
      if (isPass) {
        passed++;
        const msg = `🔥 <b>Strong applicant</b> — ${name}\nScore: <b>${score}/100</b> (${verdict})\n${reason}${email ? `\n✉️ ${email}` : ""}${telegram ? `\n💬 ${telegram}` : ""}`;
        const sent = await tgSend(tgChat, msg);
        if (sent) { messaged++; await sbWrite("PATCH", `applicants?response_id=eq.${encodeURIComponent(token)}`, { messaged: true, status: "messaged" }); }
      }
    }

    return res.status(200).json({ ok: true, screened, passed, messaged });
  } catch (e) {
    console.error("[screen-applicants]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
