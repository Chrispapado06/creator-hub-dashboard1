-- Team chat — Phase 1.5: categories + role-gated visibility.
--
-- Adds a category layer on top of channels (Discord-style). Each
-- category can declare an `allowed_roles` set; channels inside that
-- category are only visible to chatters whose role is in the set.
-- Admins (auto-created chatters with role='manager' from
-- ensureCurrentChatUser) and any chatter explicitly granted always
-- see everything.
--
-- A NULL or empty allowed_roles array means "everyone can see this
-- category" — the default, equivalent to public.
--
-- Channels can also live OUTSIDE any category (category_id IS NULL).
-- Those keep their existing visibility rules (public/private/dm/creator).

CREATE TABLE IF NOT EXISTS public.team_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  -- Array of chatter role values: 'chatter', 'reddit_va',
  -- 'instagram_va', 'facebook_va', 'x_va', 'tiktok_va',
  -- 'social_media_va', 'content_editor', 'recruiter', 'manager',
  -- 'other'. NULL/empty = visible to everyone.
  allowed_roles TEXT[],
  created_by UUID REFERENCES public.chatters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_team_categories_position
  ON public.team_categories(position, name);

-- Channels can belong to a category (or sit at the top level if NULL).
ALTER TABLE public.team_channels
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.team_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_team_channels_category
  ON public.team_channels(category_id, position, name);

-- RLS — same Public-full-access pattern as the rest of the app
ALTER TABLE public.team_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.team_categories;
CREATE POLICY "Public full access" ON public.team_categories FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime so category creates/edits propagate to other admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='team_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_categories;
  END IF;
END $$;
ALTER TABLE public.team_categories REPLICA IDENTITY FULL;
