-- Broaden chatters into a general staff table by adding a role column.
-- Existing rows default to 'chatter'. Constraint is a loose CHECK so it's easy
-- to add roles later without an enum migration.

ALTER TABLE public.chatters
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'chatter';

ALTER TABLE public.chatters DROP CONSTRAINT IF EXISTS chatters_role_check;
ALTER TABLE public.chatters ADD CONSTRAINT chatters_role_check
  CHECK (role IN ('chatter', 'social_media_va', 'content_editor', 'recruiter', 'manager', 'other'));

CREATE INDEX IF NOT EXISTS idx_chatters_role ON public.chatters(role);
