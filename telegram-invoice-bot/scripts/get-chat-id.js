// One-off helper: prints the chat id(s) that have messaged your bot.
//
//   1. Message your bot on Telegram (send it any text).
//   2. Run: npm run get-chat-id
//   3. Copy the numeric id into TELEGRAM_CHAT_ID in your .env

import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN in .env first.');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();

if (!data.ok) {
  console.error('Telegram API error:', data);
  process.exit(1);
}

const chats = new Map();
for (const u of data.result) {
  const chat = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.log(
    'No chats found. Send your bot any message on Telegram first, then re-run this.\n' +
      '(Telegram only keeps recent updates, so message it shortly before running.)'
  );
  process.exit(0);
}

console.log('Chats that have messaged your bot:\n');
for (const chat of chats.values()) {
  const who =
    chat.title ||
    [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
    chat.username ||
    '(unknown)';
  console.log(`  ${chat.id}  —  ${who} (${chat.type})`);
}
console.log('\nPut the numeric id into TELEGRAM_CHAT_ID in your .env');
