// Resolve Discord USERNAMES → numeric user IDs via the Bernard bot.
//
// Discord @-mentions need the numeric user id (<@123…>) — a plain @username in
// a message notifies no one. The ops doc only has usernames, so this looks each
// one up in the server and prints name → username → id.
//
// Requires:
//   DISCORD_BOT_TOKEN  — Bernard's bot token (Bernard must be IN the server)
//   DISCORD_GUILD_ID   — the Discord server (guild) id
// The bot needs the "Server Members Intent" enabled:
//   Discord Dev Portal → your app → Bot → Privileged Gateway Intents →
//   Server Members Intent = ON.
//
//   DISCORD_BOT_TOKEN=… DISCORD_GUILD_ID=… node shift-downtime-monitor/resolve-discord-ids.mjs
//
// Read-only — writes nothing. Copy the printed JSON back to me (or into the
// shift sync) to wire the pings.

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;

// name → discord username (from the ops doc). null = not provided / "cant find".
const PEOPLE = {
  "Gil":        "seru77",
  "wayne":      "kadrinewayne",
  "tiff":       "tiipaniiixx",
  "brian":      "pencil8820",
  "jett":       "auzeljett0808",
  "Juno":       "junosannn",
  "nikola":     null,
  "coleen":     "coleen_tiu",
  "anika":      "sinekaypo",
  "zield":      "zealousduckquack",
  "randy jade": "jadejadulco",
  "mitch":      "mishy0040",
  "Yam":        "yammhe",
  "David":      "beli_gin",
  "Christlyr":  "christlyrpericon",
  "Sam":        "samderella071698",
  "Jherard":    "_jrdls",
  "Vyy":        "fantastic_beetle_00245",
};

if (!TOKEN || !GUILD) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID. See the header of this file.");
  process.exit(1);
}

async function search(username) {
  const url = `https://discord.com/api/v10/guilds/${GUILD}/members/search?query=${encodeURIComponent(username)}&limit=10`;
  const r = await fetch(url, { headers: { Authorization: `Bot ${TOKEN}` } });
  if (r.status === 429) {
    const retry = Number(r.headers.get("retry-after") || 1);
    await new Promise((res) => setTimeout(res, (retry + 0.2) * 1000));
    return search(username);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return r.json();
}

const out = {};
console.log("name         username               discord_id");
console.log("───────────  ─────────────────────  ──────────────────");
for (const [name, username] of Object.entries(PEOPLE)) {
  if (!username) { console.log(`${name.padEnd(12)} ${"—".padEnd(22)} (no username in doc)`); continue; }
  try {
    const members = await search(username);
    const m = members.find((x) => (x.user?.username || "").toLowerCase() === username.toLowerCase()) ?? members[0];
    if (m?.user?.id) {
      out[name] = m.user.id;
      const exact = (m.user.username || "").toLowerCase() === username.toLowerCase() ? "" : "  ⚠ fuzzy match";
      console.log(`${name.padEnd(12)} ${username.padEnd(22)} ${m.user.id}${exact}`);
    } else {
      console.log(`${name.padEnd(12)} ${username.padEnd(22)} NOT FOUND in server`);
    }
  } catch (e) {
    console.log(`${name.padEnd(12)} ${username.padEnd(22)} ERROR ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 350)); // gentle on rate limits
}
console.log("\nResolved JSON (name → discord_id):\n" + JSON.stringify(out, null, 2));
