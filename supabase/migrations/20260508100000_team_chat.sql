-- Team chat — Phase 1: real-time channels, DMs, mentions, attachments.
--
-- Builds on Supabase Realtime (which the project already has by default
-- since the postgres-changes wire is on). Each table follows the same
-- single-tenant Public-RLS pattern the rest of the app uses; the agency
-- enforces who's allowed in app code (only logged-in users hit /chat).
--
-- Design notes:
--   • Channels can be public (visible to everyone), private (membership
--     gated), creator-bound (auto-created per creator), or DM (1:1).
--   • Messages keep both author_chatter_id (FK, nullable for safety
--     against deletes) AND a denormalized author_name + author_role so
--     historical messages stay readable even if the chatter row is
--     removed.
--   • team_channel_members.last_read_at powers unread counts. UI bumps
--     it whenever the channel becomes active.
--   • team_message_mentions feeds the existing notifications bell — one
--     row per @mention so we can fan out efficiently.
--   • A `chat-attachments` storage bucket is created public so the app
--     can use public URLs without signing every render.

-- ── Channels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public', 'private', 'creator', 'dm', 'announcements')),
  -- For type='creator', this is the linked creator (auto-created on demand)
  creator_id UUID REFERENCES public.creators(id) ON DELETE CASCADE,
  description TEXT,
  -- Some channels are admin-only-write (e.g. announcements)
  read_only_for_staff BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.chatters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  -- Cached counters (populated by the app, kept loose for simplicity)
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_team_channels_type ON public.team_channels(type);
CREATE INDEX IF NOT EXISTS idx_team_channels_creator ON public.team_channels(creator_id);
CREATE INDEX IF NOT EXISTS idx_team_channels_last_message ON public.team_channels(last_message_at DESC NULLS LAST);

-- ── Channel membership / read state ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_channel_members (
  channel_id UUID NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (channel_id, chatter_id)
);
CREATE INDEX IF NOT EXISTS idx_team_channel_members_chatter ON public.team_channel_members(chatter_id);

-- ── Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  -- Author FK is nullable so deleting a chatter doesn't nuke their history
  author_chatter_id UUID REFERENCES public.chatters(id) ON DELETE SET NULL,
  -- Snapshots so old messages still render after author changes / removal
  author_name TEXT NOT NULL,
  author_role TEXT,
  content TEXT NOT NULL,
  -- Array of { url, name, type, size } objects
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_messages_channel ON public.team_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_author ON public.team_messages(author_chatter_id);

-- ── Mentions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_message_mentions (
  message_id UUID NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  mentioned_chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, mentioned_chatter_id)
);
CREATE INDEX IF NOT EXISTS idx_team_message_mentions_chatter ON public.team_message_mentions(mentioned_chatter_id, read_at, created_at DESC);

-- ── RLS — same pattern as the rest of the project ───────────────────
ALTER TABLE public.team_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_channel_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access" ON public.team_channels;
DROP POLICY IF EXISTS "Public full access" ON public.team_channel_members;
DROP POLICY IF EXISTS "Public full access" ON public.team_messages;
DROP POLICY IF EXISTS "Public full access" ON public.team_message_mentions;

CREATE POLICY "Public full access" ON public.team_channels         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.team_channel_members  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.team_messages         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.team_message_mentions FOR ALL USING (true) WITH CHECK (true);

-- ── Storage bucket for attachments ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Public storage policy for the bucket (matches the landing-assets pattern)
DROP POLICY IF EXISTS "Public can read chat-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload chat-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can manage chat-attachments" ON storage.objects;
CREATE POLICY "Anyone can manage chat-attachments"
  ON storage.objects FOR ALL
  USING (bucket_id = 'chat-attachments')
  WITH CHECK (bucket_id = 'chat-attachments');

-- ── Seed the two baseline channels so the app has something to land on ──
-- #general (everyone can post) and #announcements (admin posts only).
-- Idempotent via the slug unique constraint.
INSERT INTO public.team_channels (name, slug, type, description)
VALUES
  ('general',       'general',       'public',        'Everything else — chat, banter, daily check-ins.'),
  ('announcements', 'announcements', 'announcements', 'Posted by admins only — read by everyone.')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.team_channels SET read_only_for_staff = true WHERE slug = 'announcements';
