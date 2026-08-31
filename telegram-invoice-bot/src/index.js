// Bot init, cron setup, command handlers, and the add/edit/remove wizards.

import 'dotenv/config';
import cron from 'node-cron';
import { Telegraf, Scenes, session } from 'telegraf';
import { DateTime } from 'luxon';

import { loadCreators, saveCreators, getDataFile } from './store.js';
import { buildDailyReport } from './schedule.js';
import { formatDaily, formatList, describeFrequency } from './format.js';
import {
  VALID_TYPES,
  VALID_STATUSES,
  needsDate,
  datePrompt,
  parseDateInput,
  statusForType,
} from './wizard.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.TELEGRAM_CHAT_ID;
const ZONE = process.env.TZ || 'Europe/Nicosia';
const DAILY_CRON = process.env.DAILY_CRON || '0 9 * * *';
const DIGEST_DAY = process.env.WEEKLY_DIGEST_DAY || 'Monday';

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env — get one from @BotFather.');
  process.exit(1);
}
if (!OWNER_ID) {
  console.error('Missing TELEGRAM_CHAT_ID in .env — run: npm run get-chat-id');
  process.exit(1);
}
if (!cron.validate(DAILY_CRON)) {
  console.error(`Invalid DAILY_CRON expression: "${DAILY_CRON}"`);
  process.exit(1);
}

// HTML send options used for the data-display messages.
const HTML = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

const bot = new Telegraf(BOT_TOKEN);

// Only respond to the configured owner; strangers who find the bot are ignored.
bot.use((ctx, next) => {
  const id = ctx.chat?.id ?? ctx.from?.id;
  if (String(id) !== String(OWNER_ID)) return;
  return next();
});

// ---------------------------------------------------------------------------
// Helpers shared by the wizards
// ---------------------------------------------------------------------------
function findByName(creators, arg) {
  return creators.filter((c) => c.name.toLowerCase().includes(arg.toLowerCase()));
}

function creatorSummary(c) {
  return (
    `Name: ${c.name}\n` +
    `Schedule: ${describeFrequency(c)}\n` +
    `Rate: ${c.method || '—'}\n` +
    `Notes: ${c.notes || '—'}\n` +
    `Status: ${c.status || 'active'}`
  );
}

const RATE_PROMPT = 'Rate / % / formula?  (e.g. "28% of tips & messages", or "-" to skip)';

// ---------------------------------------------------------------------------
// /add — build a new creator
// ---------------------------------------------------------------------------
const addScene = new Scenes.BaseScene('add-creator');

addScene.enter((ctx) => {
  ctx.scene.state.draft = { frequency: {}, status: 'active' };
  ctx.scene.state.phase = 'name';
  return ctx.reply("➕ Add a creator.\n\nName?  (send /cancel any time to abort)");
});

addScene.command('cancel', async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('Cancelled — nothing was saved.');
});

addScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) {
    return ctx.reply("You're mid-add. Send /cancel to abort, or answer the question above.");
  }

  const st = ctx.scene.state;
  const d = st.draft;

  switch (st.phase) {
    case 'name':
      d.name = text;
      st.phase = 'type';
      return ctx.reply(`Frequency type? Reply with one of:\n${VALID_TYPES.join(', ')}`);

    case 'type': {
      const t = text.toLowerCase();
      if (!VALID_TYPES.includes(t)) {
        return ctx.reply(`Not valid. Choose one of: ${VALID_TYPES.join(', ')}`);
      }
      d.frequency = { type: t };
      d.status = statusForType(t);
      if (needsDate(t)) {
        st.pendingType = t;
        st.phase = 'date';
        return ctx.reply(datePrompt(t));
      }
      st.phase = 'method';
      return ctx.reply(RATE_PROMPT);
    }

    case 'date': {
      const res = parseDateInput(st.pendingType, text);
      if (res.error) return ctx.reply(res.error);
      d.frequency = res.frequency;
      st.phase = 'method';
      return ctx.reply(RATE_PROMPT);
    }

    case 'method':
      d.method = text === '-' ? '' : text;
      st.phase = 'notes';
      return ctx.reply('Notes?  (free text, or "-" to skip)');

    case 'notes': {
      d.notes = text === '-' ? '' : text;
      st.phase = 'confirm';
      return ctx.reply(`Please confirm:\n\n${creatorSummary(d)}\n\nSave? (yes/no)`);
    }

    case 'confirm': {
      if (!/^y(es)?$/i.test(text)) {
        await ctx.scene.leave();
        return ctx.reply('Discarded — nothing was saved.');
      }
      const creators = loadCreators();
      creators.push(d);
      saveCreators(creators);
      await ctx.scene.leave();
      return ctx.reply(`✅ Added ${d.name}.`);
    }

    default:
      return;
  }
});

// ---------------------------------------------------------------------------
// /edit — change one creator's fields, one at a time, via a menu
// ---------------------------------------------------------------------------
const editScene = new Scenes.BaseScene('edit-creator');

function showEditMenu(ctx) {
  const c = loadCreators().find((x) => x.name === ctx.scene.state.name);
  if (!c) return ctx.scene.leave().then(() => ctx.reply('That creator no longer exists.'));
  ctx.scene.state.phase = 'menu';
  return ctx.reply(
    `✏️ Editing ${c.name}\n\n${creatorSummary(c)}\n\n` +
      'Change what? Reply:  rate · schedule · notes · status · done'
  );
}

// Load the target, apply a mutation, and persist. Returns the creator or null.
function mutateTarget(name, mutator) {
  const creators = loadCreators();
  const c = creators.find((x) => x.name === name);
  if (!c) return null;
  mutator(c);
  saveCreators(creators);
  return c;
}

editScene.enter((ctx) => showEditMenu(ctx));

editScene.command('cancel', async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('Done editing.');
});

editScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) {
    return ctx.reply("You're editing. Send /cancel to finish, or answer the question above.");
  }

  const st = ctx.scene.state;

  switch (st.phase) {
    case 'menu': {
      const choice = text.toLowerCase();
      if (['done', 'exit', 'finish', 'quit'].includes(choice)) {
        await ctx.scene.leave();
        return ctx.reply('Done editing.');
      }
      if (['rate', 'method', '%'].includes(choice)) {
        st.phase = 'rate';
        return ctx.reply(RATE_PROMPT);
      }
      if (['schedule', 'frequency', 'freq'].includes(choice)) {
        st.phase = 'sched_type';
        return ctx.reply(`New frequency type? One of:\n${VALID_TYPES.join(', ')}`);
      }
      if (['notes', 'note'].includes(choice)) {
        st.phase = 'notes';
        return ctx.reply('New notes?  (free text, or "-" to clear)');
      }
      if (['status'].includes(choice)) {
        st.phase = 'status';
        return ctx.reply(`New status? One of:\n${VALID_STATUSES.join(', ')}`);
      }
      return ctx.reply('Reply with:  rate · schedule · notes · status · done');
    }

    case 'rate': {
      mutateTarget(st.name, (c) => {
        c.method = text === '-' ? '' : text;
      });
      await ctx.reply('✅ Rate updated.');
      return showEditMenu(ctx);
    }

    case 'notes': {
      mutateTarget(st.name, (c) => {
        c.notes = text === '-' ? '' : text;
      });
      await ctx.reply('✅ Notes updated.');
      return showEditMenu(ctx);
    }

    case 'status': {
      const s = text.toLowerCase();
      if (!VALID_STATUSES.includes(s)) {
        return ctx.reply(`Not valid. Choose one of: ${VALID_STATUSES.join(', ')}`);
      }
      mutateTarget(st.name, (c) => {
        c.status = s;
      });
      await ctx.reply('✅ Status updated.');
      return showEditMenu(ctx);
    }

    case 'sched_type': {
      const t = text.toLowerCase();
      if (!VALID_TYPES.includes(t)) {
        return ctx.reply(`Not valid. Choose one of: ${VALID_TYPES.join(', ')}`);
      }
      if (needsDate(t)) {
        st.pendingType = t;
        st.phase = 'sched_date';
        return ctx.reply(datePrompt(t));
      }
      mutateTarget(st.name, (c) => {
        c.frequency = { type: t };
        c.status = statusForType(t);
      });
      await ctx.reply('✅ Schedule updated.');
      return showEditMenu(ctx);
    }

    case 'sched_date': {
      const res = parseDateInput(st.pendingType, text);
      if (res.error) return ctx.reply(res.error);
      mutateTarget(st.name, (c) => {
        c.frequency = res.frequency;
      });
      await ctx.reply('✅ Schedule updated.');
      return showEditMenu(ctx);
    }

    default:
      return;
  }
});

// ---------------------------------------------------------------------------
// /remove — delete a creator (with confirmation)
// ---------------------------------------------------------------------------
const removeScene = new Scenes.BaseScene('remove-creator');

removeScene.enter((ctx) =>
  ctx.reply(`🗑️ Remove ${ctx.scene.state.name}? This deletes them from creators.json. (yes/no)`)
);

removeScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!/^y(es)?$/i.test(text)) {
    await ctx.scene.leave();
    return ctx.reply('Cancelled — nothing removed.');
  }
  const creators = loadCreators();
  const idx = creators.findIndex((c) => c.name === ctx.scene.state.name);
  if (idx === -1) {
    await ctx.scene.leave();
    return ctx.reply('Already gone — nothing removed.');
  }
  const [removed] = creators.splice(idx, 1);
  saveCreators(creators);
  await ctx.scene.leave();
  return ctx.reply(`🗑️ Removed ${removed.name}.`);
});

const stage = new Scenes.Stage([addScene, editScene, removeScene]);
bot.use(session());
bot.use(stage.middleware());

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function helpText() {
  return [
    '<b>🤖 Invoice Reminder Bot</b>',
    '',
    '/today — today’s invoice list',
    '/list — all creators &amp; their schedules',
    '/add — add a creator (rate, schedule, notes)',
    '/edit &lt;name&gt; — change a creator’s rate/schedule/notes/status',
    '/remove &lt;name&gt; — delete a creator',
    '/resolve &lt;name&gt; — mark a manual-review creator active',
    '/help — this message',
    '',
    '<i>Tip: type “/” to see the command menu.</i>',
  ].join('\n');
}

function buildTodayMessage() {
  const now = DateTime.now().setZone(ZONE);
  const report = buildDailyReport(loadCreators(), now, { digestDay: DIGEST_DAY });
  return formatDaily({ now, report });
}

bot.start((ctx) => ctx.reply(helpText(), HTML));
bot.help((ctx) => ctx.reply(helpText(), HTML));

bot.command('today', (ctx) => ctx.reply(buildTodayMessage(), HTML));
bot.command('list', (ctx) => ctx.reply(formatList(loadCreators()), HTML));
bot.command('add', (ctx) => ctx.scene.enter('add-creator'));

bot.command('edit', (ctx) => {
  const arg = ctx.message.text.replace(/^\/edit(@\S+)?/i, '').trim();
  if (!arg) return ctx.reply('Usage: /edit <name>');
  const matches = findByName(loadCreators(), arg);
  if (matches.length === 0) return ctx.reply(`No creator matching "${arg}".`);
  if (matches.length > 1) {
    return ctx.reply(`Ambiguous — matches: ${matches.map((m) => m.name).join(', ')}. Be more specific.`);
  }
  return ctx.scene.enter('edit-creator', { name: matches[0].name });
});

bot.command('remove', (ctx) => {
  const arg = ctx.message.text.replace(/^\/remove(@\S+)?/i, '').trim();
  if (!arg) return ctx.reply('Usage: /remove <name>');
  const matches = findByName(loadCreators(), arg);
  if (matches.length === 0) return ctx.reply(`No creator matching "${arg}".`);
  if (matches.length > 1) {
    return ctx.reply(`Ambiguous — matches: ${matches.map((m) => m.name).join(', ')}. Be more specific.`);
  }
  return ctx.scene.enter('remove-creator', { name: matches[0].name });
});

bot.command('resolve', (ctx) => {
  const arg = ctx.message.text.replace(/^\/resolve(@\S+)?/i, '').trim();
  if (!arg) return ctx.reply('Usage: /resolve <name>');
  const creators = loadCreators();
  const matches = findByName(creators, arg);
  if (matches.length === 0) return ctx.reply(`No creator matching "${arg}".`);
  if (matches.length > 1) {
    return ctx.reply(`Ambiguous — matches: ${matches.map((m) => m.name).join(', ')}. Be more specific.`);
  }
  const c = matches[0];
  if (c.status !== 'manual_review') {
    return ctx.reply(`${c.name} is not in manual review (status: ${c.status}). Nothing to resolve.`);
  }
  c.status = 'active';
  saveCreators(creators);
  let reply = `✅ ${c.name} marked active.`;
  if (!c.frequency || !c.frequency.type || c.frequency.type === 'manual_review') {
    reply +=
      '\n⚠️ They have no real schedule yet — use /edit ' +
      c.name +
      " to set one, or they won't appear in daily reminders.";
  }
  return ctx.reply(reply);
});

// ---------------------------------------------------------------------------
// Daily cron + startup
// ---------------------------------------------------------------------------
async function sendDaily() {
  try {
    await bot.telegram.sendMessage(OWNER_ID, buildTodayMessage(), HTML);
    console.log(`[${new Date().toISOString()}] daily reminder sent`);
  } catch (e) {
    console.error('Failed to send daily reminder:', e);
  }
}

cron.schedule(DAILY_CRON, sendDaily, { timezone: ZONE });

bot.catch((err) => console.error('Bot error:', err));

async function registerCommandMenu() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'today', description: 'Today’s invoice list' },
      { command: 'list', description: 'All creators & schedules' },
      { command: 'add', description: 'Add a creator' },
      { command: 'edit', description: 'Edit a creator' },
      { command: 'remove', description: 'Remove a creator' },
      { command: 'resolve', description: 'Mark a creator as sorted' },
      { command: 'help', description: 'Show help' },
    ]);
  } catch (e) {
    console.error('setMyCommands failed:', e);
  }
}

bot
  .launch(() => {
    // Fires right after getMe(), before the (never-resolving) polling loop.
    registerCommandMenu();
    console.log(
      `Bot started. tz=${ZONE}, dailyCron="${DAILY_CRON}", digestDay=${DIGEST_DAY}`
    );
    console.log(`Data file: ${getDataFile()}`);
  })
  .catch((e) => {
    console.error('Failed to launch bot:', e);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
