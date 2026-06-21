// Personal Discord DM for the task pipeline, via a Discord BOT (not a webhook).
//
// A DM is each person's private channel — so a handoff ping lands in their own
// Discord inbox, not a shared channel. The browser can't hold the bot token, so
// the client POSTs here and THIS function (Vercel, secret in process.env) sends.
//
// Requirements: the bot must share a server with the recipient, and the
// recipient must allow DMs from server members.
//
// Vercel env vars:
//   DISCORD_BOT_TOKEN          — the bot token from discord.com/developers
//   DISCORD_TASK_NOTIFY_SECRET — optional shared secret (x-task-notify-secret)
//
// Always responds 200 (best-effort) — a failed DM must never break the caller.

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SECRET = process.env.DISCORD_TASK_NOTIFY_SECRET;

// Open a DM channel with the user, then post the message. Throws on failure.
async function discordDM(token, recipientId, content) {
  const chRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: String(recipientId) }),
  });
  if (!chRes.ok) throw new Error(`open DM ${chRes.status}: ${(await chRes.text().catch(() => "")).slice(0, 160)}`);
  const ch = await chRes.json();
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: String(content).slice(0, 1900) }),
  });
  if (!msgRes.ok) throw new Error(`send DM ${msgRes.status}: ${(await msgRes.text().catch(() => "")).slice(0, 160)}`);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: Boolean(TOKEN) });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (SECRET && req.headers["x-task-notify-secret"] !== SECRET) {
    return res.status(401).json({ ok: false, error: "bad secret" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const discordId = body && body.discordId;
  const content = (body && body.content ? String(body.content) : "").slice(0, 1800);

  if (!discordId || !content) {
    return res.status(200).json({ ok: false, error: "missing discordId or content" });
  }
  if (!TOKEN) {
    console.error("[discord-dm] not configured (DISCORD_BOT_TOKEN)");
    return res.status(200).json({ ok: false, error: "discord bot not configured" });
  }

  try {
    await discordDM(TOKEN, discordId, content);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[discord-dm]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
