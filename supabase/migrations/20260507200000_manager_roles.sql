-- Adds specialized manager roles so admins can mark someone as the
-- manager of a particular function (chatting / Reddit / IG / FB / TikTok / X /
-- social media / content). The generic "manager" role still exists for
-- agency-wide / executive-level managers.

ALTER TABLE public.chatters DROP CONSTRAINT IF EXISTS chatters_role_check;
ALTER TABLE public.chatters ADD CONSTRAINT chatters_role_check
  CHECK (role IN (
    -- Individual contributors
    'chatter',
    'reddit_va', 'instagram_va', 'facebook_va', 'x_va', 'tiktok_va',
    'social_media_va',
    'content_editor',
    'recruiter',
    -- Specialized managers (new)
    'chatter_manager',
    'reddit_manager', 'instagram_manager', 'facebook_manager', 'x_manager', 'tiktok_manager',
    'social_media_manager',
    'content_manager',
    -- Catch-alls
    'manager',
    'other'
  ));
