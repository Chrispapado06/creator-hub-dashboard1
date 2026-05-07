-- Staff portal v2: announcements, training, scripts, coaching, goals.
-- All admin-managed; staff portal reads them and shows the right scope per chatter.

-- ── Announcements (manager → all/role/specific staff) ───────────────────────
CREATE TABLE IF NOT EXISTS public.staff_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  scope TEXT NOT NULL DEFAULT 'all',     -- 'all' | role string (chatter, reddit_va, ...) | specific chatter_id
  expires_at TIMESTAMPTZ,                -- if set, auto-hide after this
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_announcements_created
  ON public.staff_announcements(created_at DESC);
ALTER TABLE public.staff_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_announcements;
CREATE POLICY "Public full access" ON public.staff_announcements FOR ALL USING (true) WITH CHECK (true);

-- ── Training materials (general or per-creator playbooks) ──────────────────
CREATE TABLE IF NOT EXISTS public.staff_training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  body TEXT,                            -- markdown
  video_url TEXT,                       -- optional embed (YouTube/Vimeo/Loom)
  category TEXT,                        -- 'onboarding' | 'policies' | 'playbook' | 'tactics' | 'compliance' | 'other'
  creator_id UUID REFERENCES public.creators(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'all',    -- 'all' | role
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_training_creator
  ON public.staff_training_materials(creator_id);
CREATE INDEX IF NOT EXISTS idx_staff_training_category
  ON public.staff_training_materials(category, display_order);
ALTER TABLE public.staff_training_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_training_materials;
CREATE POLICY "Public full access" ON public.staff_training_materials FOR ALL USING (true) WITH CHECK (true);

-- ── Script library (categorized DM/PPV/recovery snippets) ──────────────────
CREATE TABLE IF NOT EXISTS public.staff_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,               -- 'opener' | 'tease' | 'ppv_unlock' | 'tip_bait' | 'vip_recovery' | 'custom_request' | 'other'
  creator_id UUID REFERENCES public.creators(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_scripts_category
  ON public.staff_scripts(category, display_order);
CREATE INDEX IF NOT EXISTS idx_staff_scripts_creator
  ON public.staff_scripts(creator_id);
ALTER TABLE public.staff_scripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_scripts;
CREATE POLICY "Public full access" ON public.staff_scripts FOR ALL USING (true) WITH CHECK (true);

-- ── Coaching notes (manager → individual chatter) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_coaching_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  visible_to_staff BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_coaching_chatter
  ON public.staff_coaching_notes(chatter_id, created_at DESC);
ALTER TABLE public.staff_coaching_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_coaching_notes;
CREATE POLICY "Public full access" ON public.staff_coaching_notes FOR ALL USING (true) WITH CHECK (true);

-- ── Goals (per-chatter targets — manager-set or self-set) ──────────────────
CREATE TABLE IF NOT EXISTS public.staff_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'revenue',   -- 'revenue' | 'hours' | 'shifts' | 'ppv_count'
  target_amount NUMERIC NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  set_by TEXT,                              -- 'manager' or chatter username
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_goals_chatter
  ON public.staff_goals(chatter_id, period_end);
ALTER TABLE public.staff_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_goals;
CREATE POLICY "Public full access" ON public.staff_goals FOR ALL USING (true) WITH CHECK (true);
