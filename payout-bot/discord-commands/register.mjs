#!/usr/bin/env node
// One-time script to register Bernard Shift Approval's slash commands
// with Discord. Run after deploying the discord-bot edge function,
// any time the command definitions below change, and any time the
// bot is added to a fresh server (global commands apply to every
// guild the bot is in but propagate within ~1 hour).
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node payout-bot/discord-commands/register.mjs

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN  = process.env.DISCORD_BOT_TOKEN;
if (!APP_ID || !TOKEN) {
  console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN before running.");
  process.exit(1);
}

const commands = [
  {
    name: "shift",
    description: "Submit a completed shift for manager approval.",
    options: [
      { name: "in",       description: "Clock-in time, PHT / Philippine time (e.g. 19:00 or 7:30pm)",  type: 3, required: true },
      { name: "out",      description: "Clock-out time, PHT / Philippine time (e.g. 21:30 or 9:30pm)", type: 3, required: true },
      { name: "proof",    description: "Screenshot of your work (proof of shift)",       type: 11, required: true }, // 11 = ATTACHMENT
      { name: "accounts", description: "Comma-separated Reddit accounts you posted on (optional)", type: 3, required: false },
    ],
  },
  {
    name: "shifts",
    description: "See your last 14 days of submitted shifts.",
  },
  {
    name: "payroll",
    description: "Manager only — approved hours + pay per VA over the chosen window.",
    options: [
      {
        name: "period",
        description: "Time window",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "Last 7 days",  value: "week"  },
          { name: "Last 30 days", value: "month" },
        ],
      },
    ],
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: { "Authorization": `Bot ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
const txt = await res.text();
if (!res.ok) {
  console.error("Failed:", res.status, txt);
  process.exit(1);
}
console.log("Registered", commands.length, "commands.");
console.log(txt);
