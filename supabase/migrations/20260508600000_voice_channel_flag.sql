-- Mark certain text channels as "voice channels" (Discord-style).
--
-- Voice channels are the ONLY place where users can:
--   • Join a voice call
--   • Turn on their camera
--   • Share their screen
--
-- Regular text channels stay text-only — clicking them just shows the
-- message list, no voice banner, no controls. This matches what users
-- expect from Discord and keeps mic/camera permission prompts out of
-- the chat-only flow.
--
-- Storage is a single boolean on team_channels. Default false so all
-- existing channels stay text-only and admins opt-in to voice per
-- channel.

ALTER TABLE public.team_channels
  ADD COLUMN IF NOT EXISTS is_voice_channel BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_team_channels_voice
  ON public.team_channels(is_voice_channel) WHERE is_voice_channel;
