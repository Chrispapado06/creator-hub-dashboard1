-- Live daily digest: remember WHICH Discord message is today's digest for each
-- person, so ticking a task off in the dashboard can EDIT that message in place
-- (the completed line disappears) instead of leaving a stale list sitting in
-- their channel until tomorrow's post.
--
-- One row per (chatter, day) — the digest is reposted fresh each morning.
--
--   extra    the non-task sections the digest was built with (⏰ Coming up /
--            🎬 Content) plus the day's label. Those come from side-effectful
--            logic (content-tracker bumps write last_bumped) that must NOT
--            re-run on every edit, so we replay them verbatim.
--   content  the exact text last sent, so a refresh that changes nothing skips
--            the Discord call entirely (no wasted rate-limit budget).

CREATE TABLE IF NOT EXISTS public.discord_digest_posts (
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  channel_id TEXT NOT NULL,            -- the person's channel, or their DM channel
  message_id TEXT NOT NULL,
  extra      JSONB NOT NULL DEFAULT '{}'::jsonb,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chatter_id, day)
);
CREATE INDEX IF NOT EXISTS idx_discord_digest_posts_day ON public.discord_digest_posts(day DESC);

ALTER TABLE public.discord_digest_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.discord_digest_posts;
CREATE POLICY "Public full access" ON public.discord_digest_posts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_discord_digest_posts_updated ON public.discord_digest_posts;
CREATE TRIGGER trg_discord_digest_posts_updated BEFORE UPDATE ON public.discord_digest_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
