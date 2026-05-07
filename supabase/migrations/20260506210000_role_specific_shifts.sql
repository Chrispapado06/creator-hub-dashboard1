-- Role-specific shift tracking. Different staff roles capture different
-- metrics at clock-out (Reddit VAs track upvotes / posts, IG VAs track likes /
-- DMs, etc.) and clock in against a specific platform account, not just a
-- creator. Stored on the existing shifts table.

-- Expand chatter role enum to include platform-specific VAs
ALTER TABLE public.chatters DROP CONSTRAINT IF EXISTS chatters_role_check;
ALTER TABLE public.chatters ADD CONSTRAINT chatters_role_check
  CHECK (role IN (
    'chatter',
    'reddit_va', 'instagram_va', 'facebook_va', 'x_va', 'tiktok_va',
    'social_media_va', 'content_editor', 'recruiter', 'manager', 'other'
  ));

-- Add role-specific tracking fields to shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS posts_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upvotes_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_received INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dms_handled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_platform TEXT,
  ADD COLUMN IF NOT EXISTS target_account_id UUID,
  ADD COLUMN IF NOT EXISTS target_account_name TEXT;

CREATE INDEX IF NOT EXISTS idx_shifts_target_platform
  ON public.shifts(target_platform) WHERE target_platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_target_account
  ON public.shifts(target_account_id) WHERE target_account_id IS NOT NULL;
