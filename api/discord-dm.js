// Personal Discord task ping via the bot — posts to a person's CHANNEL (and
// @-mentions them), or falls back to a DM if no channel is set.
//
// The browser can't hold the bot token, so the client POSTs here and THIS
// function (Vercel, secret in process.env) sends.
//
// Requirements: the bot must be in the server and able to Send Messages in the
// channel (and Manage Messages if you want pinning). For DM fallback the bot
// must share a server with the recipient and they must allow DMs.
//
// Vercel env vars:
//   DISCORD_BOT_TOKEN          — the bot token from discord.com/developers
//   DISCORD_TASK_NOTIFY_SECRET — optional shared secret (x-task-notify-secret)
//
// Body: { channelId?, discordId?, content, pin? } — at least one of channelId /
// discordId. Always responds 200 (best-effort).

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SECRET = process.env.DISCORD_TASK_NOTIFY_SECRET;

async function postToChannel(token, channelId, content) {
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: ["users"] } }),
  });
  if (!r.ok) throw new Error(`post ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return r.json();
}

async function openDM(token, recipientId) {
  const r = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: String(recipientId) }),
  });
  if (!r.ok) throw new Error(`open DM ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return (await r.json()).id;
}

// Best-effort pin — needs Manage Messages. Swallows failure.
async function pinMessage(token, channelId, messageId) {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/pins/${messageId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}` },
  }).catch(() => {});
}

// Deliver to one person: their channel (with @mention + optional pin), else DM.
async function deliver(token, { channelId, discordId, content, pin }) {
  if (channelId) {
    // Mention on its OWN line so any leading markdown (## / ### headers, - bullets)
    // in the content still renders — Discord only formats those at line start.
    const body = discordId ? `<@${discordId}>\n${content}` : content;
    const msg = await postToChannel(token, channelId, body);
    if (pin && msg && msg.id) await pinMessage(token, channelId, msg.id);
    return;
  }
  if (discordId) {
    const dmId = await openDM(token, discordId);
    await postToChannel(token, dmId, content);
    return;
  }
  throw new Error("no channelId or discordId");
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
  const channelId = body && body.channelId;
  const discordId = body && body.discordId;
  const content = (body && body.content ? String(body.content) : "").slice(0, 1800);
  const pin = Boolean(body && body.pin);

  if (!content || (!channelId && !discordId)) {
    return res.status(200).json({ ok: false, error: "missing content or target (channelId/discordId)" });
  }
  if (!TOKEN) {
    return res.status(200).json({ ok: false, error: "discord bot not configured" });
  }

  try {
    await deliver(TOKEN, { channelId, discordId, content, pin });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[discord-dm]", e && e.message);
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
