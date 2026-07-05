-- Post applicant alerts to a Discord channel webhook (in addition to / instead
-- of Telegram).
ALTER TABLE public.hiring_config ADD COLUMN IF NOT EXISTS discord_webhook text;
