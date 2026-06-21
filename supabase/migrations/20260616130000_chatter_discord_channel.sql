-- Per-person Discord CHANNEL for task pings + the daily digest.
--
-- The bot posts each person's handoff pings and daily task digest into their
-- own channel (and @-mentions them), instead of a DM. Paste the channel id in
-- Tasks → Templates → Team contacts. If no channel is set, the bot falls back
-- to a DM via discord_user_id.
alter table public.chatters
  add column if not exists discord_channel_id text;
