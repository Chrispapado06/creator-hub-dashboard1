-- Team chat voice / video calls (WebRTC peer-to-peer).
--
-- Architecture: peer-to-peer mesh via WebRTC. Up to ~6 participants
-- per channel works smoothly on a typical home/office connection;
-- beyond that you'd want a SFU (LiveKit/Daily) — out of scope for this
-- iteration.
--
-- This table is the **presence + intent** layer:
--   • A row exists for each browser tab currently joined to a voice
--     channel. It tracks who's in the call, plus whether their mic is
--     on, camera is on, and if they're sharing screen.
--   • `peer_id` is a fresh UUID per join — survives a chatter joining
--     the same channel from two devices, and lets reconnects start a
--     clean signaling session.
--   • Other clients query this table (and subscribe via Realtime) to
--     learn who they need to open WebRTC peer connections to.
--
-- The actual SDP / ICE-candidate signaling does NOT go through this
-- table — that flows over Supabase Realtime broadcast on the topic
-- `voice:${channel_id}`, peer-to-peer, ephemeral. Saves DB churn and
-- avoids row insert latency in the offer/answer handshake.
--
-- Stale-row cleanup: clients heartbeat `last_heartbeat` every 15s.
-- A row whose heartbeat is older than 60s is considered abandoned
-- (closed tab without leaving cleanly) and any client may delete it.

CREATE TABLE IF NOT EXISTS public.voice_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,                                  -- per-tab unique id
  is_muted BOOLEAN NOT NULL DEFAULT false,
  has_video BOOLEAN NOT NULL DEFAULT false,
  is_screen_sharing BOOLEAN NOT NULL DEFAULT false,
  is_speaking BOOLEAN NOT NULL DEFAULT false,             -- visual ring
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One person may join the same channel from multiple tabs (rare but
-- valid). One person joining the SAME channel from the SAME tab twice
-- shouldn't happen — but if it does, the second insert would fail on
-- this unique. peer_id is per-tab so this is effectively safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_unique_peer
  ON public.voice_session_participants(channel_id, peer_id);

CREATE INDEX IF NOT EXISTS idx_voice_channel
  ON public.voice_session_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_heartbeat
  ON public.voice_session_participants(last_heartbeat);

-- Public-RLS pattern, same as the rest of the agency-internal app.
ALTER TABLE public.voice_session_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.voice_session_participants;
CREATE POLICY "Public full access" ON public.voice_session_participants
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime so JOIN/LEAVE events fan out to everyone in the
-- channel without polling. Without REPLICA IDENTITY FULL we can't
-- subscribe to UPDATE filters meaningfully, so we set it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='voice_session_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.voice_session_participants;
  END IF;
END $$;
ALTER TABLE public.voice_session_participants REPLICA IDENTITY FULL;
