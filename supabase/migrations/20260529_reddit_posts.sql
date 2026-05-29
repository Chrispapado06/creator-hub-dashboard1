-- Reddit post cache, populated by a 5-minute GitHub Actions cron.
--
-- We can't query Reddit from Supabase Edge Functions — Reddit
-- IP-blocks Deno Deploy's outbound range. So the bot reads the
-- pre-collected post timestamps from this table instead of
-- fetching live during a /shift call. The cron script runs in
-- GitHub Actions (whitelisted by Reddit) and upserts new posts
-- into this table every 5 minutes.

CREATE TABLE IF NOT EXISTS public.reddit_posts (
  account    TEXT NOT NULL,            -- reddit username (no u/)
  post_id    TEXT NOT NULL,            -- reddit post id (from RSS <id>)
  title      TEXT,
  url        TEXT,
  created_at TIMESTAMPTZ NOT NULL,     -- when the post went up on Reddit
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account, post_id)
);

CREATE INDEX IF NOT EXISTS reddit_posts_account_created_idx
  ON public.reddit_posts (account, created_at DESC);
CREATE INDEX IF NOT EXISTS reddit_posts_created_idx
  ON public.reddit_posts (created_at DESC);

ALTER TABLE public.reddit_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.reddit_posts;
CREATE POLICY "Service role full access" ON public.reddit_posts
  FOR ALL USING (true) WITH CHECK (true);
