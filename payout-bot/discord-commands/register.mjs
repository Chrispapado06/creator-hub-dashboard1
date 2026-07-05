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

// Connected OF account display names — used as choices for /whale's `model`
// field. Order matches the OF API listAccounts() output. Add new accounts
// here and re-run the register script when a new creator is onboarded.
// Limit: Discord allows up to 25 choices per option.
const MODEL_CHOICES = [
  "Blue Bear", "Marissa munoz", "Emma", "Julie", "June - Sandra", "Antonella", "Ella",
].map((m) => ({ name: m, value: m }));

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
  {
    name: "check-subreddits",
    description: "Check if subreddits are already used (per-creator + global). Saves John a manual check.",
    options: [
      {
        name: "creator",
        description: "Which creator are you adding these to?",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "Marissa",    value: "Marissa"    },
          { name: "Maylee",     value: "Maylee"     },
          { name: "Bella Leah", value: "Bella Leah" },
          { name: "Meg",        value: "Meg"        },
          { name: "Apple",      value: "Apple"      },
          { name: "Emma",       value: "Emma"       },
          { name: "June",       value: "June"       },
          { name: "Tess",       value: "Tess"       },
        ],
      },
      {
        name: "subs",
        description: "Comma- or space-separated list (e.g. r/NewSub1, r/AnotherNew, freshsub)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "whale",
    description: "Whale-payday cards: who's getting paid today + per-whale handling.",
    options: [
      {
        name: "today",
        description: "Show whales getting paid today.",
        type: 1, // SUB_COMMAND
      },
      {
        name: "view",
        description: "Show one whale's card.",
        type: 1,
        options: [
          { name: "name",  description: "Whale name (case-insensitive)", type: 3, required: true },
          { name: "model", description: "Model (optional, narrows the match)", type: 3, required: false, choices: MODEL_CHOICES },
        ],
      },
      {
        name: "stats",
        description: "Counts: how many whales tracked per model + per handling.",
        type: 1,
      },
      {
        name: "list",
        description: "List all whales (optionally filtered by model).",
        type: 1,
        options: [
          { name: "model", description: "Filter by model (optional)", type: 3, required: false, choices: MODEL_CHOICES },
        ],
      },
      {
        name: "add",
        description: "Add or update a whale card. Admin role only.",
        type: 1,
        options: [
          { name: "name",     description: "Whale name", type: 3, required: true },
          { name: "model",    description: "Which model they're on", type: 3, required: true, choices: MODEL_CHOICES },
          { name: "payday",   description: "Day of week (optional — leave blank if unknown)", type: 3, required: false,
            choices: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => ({ name: d, value: d })) },
          { name: "handling", description: "How to handle this whale", type: 3, required: false,
            choices: [
              { name: "DO NOT SELL",    value: "DO_NOT_SELL" },
              { name: "PRE-SELL",       value: "PRE_SELL"    },
              { name: "REVIVE / CHECK", value: "REVIVE"      },
              { name: "SELL",           value: "SELL"        },
            ],
          },
          { name: "objection", description: "Last objection (short, e.g. 'wife saw card')", type: 3, required: false },
          { name: "note",      description: "Optional free-text note", type: 3, required: false },
          { name: "fan_id",    description: "OnlyFans numeric fan id (optional)", type: 3, required: false },
          { name: "birthday",    description: "Birthday MM-DD (e.g. 07-05) — shows 🎂 on the day", type: 3, required: false },
          { name: "anniversary", description: "Anniversary MM-DD (e.g. 12-01) — shows 💍 on the day", type: 3, required: false },
          { name: "job",         description: "Job update (e.g. 'new job at Google') — shows 💼", type: 3, required: false },
        ],
      },
      {
        name: "rm",
        description: "Remove a whale card. Admin role only.",
        type: 1,
        options: [
          { name: "name",  description: "Whale name", type: 3, required: true },
          { name: "model", description: "Which model", type: 3, required: true, choices: MODEL_CHOICES },
        ],
      },
      {
        name: "topic",
        description: "Set or clear what to talk about with this whale today.",
        type: 1,
        options: [
          { name: "name",  description: "Whale name", type: 3, required: true },
          { name: "model", description: "Which model", type: 3, required: true, choices: MODEL_CHOICES },
          { name: "topic", description: "Topic for today (leave blank to clear)", type: 3, required: false },
        ],
      },
    ],
  },
  {
    name: "playbook",
    description: "The whale-assist playbook (scripts/questions the bot suggests).",
    options: [
      { name: "list", description: "Show all playbook entries.", type: 1 },
      {
        name: "add",
        description: "Add or update a playbook entry. Admin only.",
        type: 1,
        options: [
          { name: "name",     description: "Short label, e.g. 'White Knight Q5'", type: 3, required: true },
          { name: "text",     description: "The actual script/question to suggest", type: 3, required: true },
          { name: "category", description: "Bucket (white_knight, opener, tease, etc.)", type: 3, required: false },
        ],
      },
      {
        name: "rm",
        description: "Remove a playbook entry. Admin only.",
        type: 1,
        options: [
          { name: "name", description: "Name of the entry to remove", type: 3, required: true },
        ],
      },
    ],
  },
  {
    name: "activity",
    description: "Manager only — Reddit-derived hours per poster (no /shift needed).",
    options: [
      {
        name: "poster",
        description: "Which VA to audit",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "All VAs",             value: "all"    },
          { name: "Cha (Reddit)",        value: "Cha"    },
          { name: "Reylee (Reddit)",     value: "Reylee" },
          { name: "Dabi (Reddit)",       value: "Dabi"   },
          { name: "Xy (Reddit)",         value: "Xy"     },
          { name: "John (Airtable)",     value: "John"   },
        ],
      },
      {
        name: "period",
        description: "Time window",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "Today (PHT)", value: "today" },
          { name: "Last 7 days", value: "week"  },
        ],
      },
    ],
  },
];

// Guild-scoped registration propagates INSTANTLY (global takes up to 1 hour).
// Set DISCORD_GUILD_ID to register to a specific server; omit it for global.
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;
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
console.log(`Registered ${commands.length} commands ${GUILD_ID ? `to guild ${GUILD_ID} (instant)` : "globally (up to 1h to propagate)"}.`);
console.log(txt);
