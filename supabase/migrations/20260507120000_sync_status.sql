-- Per-sync-job state. Used by the browser auto-sync orchestrator to throttle
-- to "once every X hours" and to coordinate across multiple open tabs via a
-- claim-the-lock-then-do-the-work pattern.
CREATE TABLE IF NOT EXISTS public.sync_status (
  id TEXT PRIMARY KEY,                       -- 'reddit_posts', 'infloww_revenue', 'instagram', etc.
  last_synced_at TIMESTAMPTZ,
  last_status TEXT,                          -- 'ok' | 'partial' | 'failed' | 'running'
  last_message TEXT,
  last_actor TEXT,                           -- the username/agent that ran it
  items_processed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,                  -- if in the future, another tab is running this
  locked_by TEXT,                            -- random tab id holding the lock
  auto_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  interval_minutes INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.sync_status;
CREATE POLICY "Public full access" ON public.sync_status FOR ALL USING (true) WITH CHECK (true);

-- Seed all the sync jobs with sensible defaults (idempotent).
INSERT INTO public.sync_status (id, interval_minutes, auto_enabled) VALUES
  ('reddit_posts',     120, TRUE),
  ('infloww_revenue',  120, TRUE),
  ('instagram',        120, TRUE),
  ('facebook',         120, TRUE),
  ('tiktok',           120, TRUE),
  ('onlyfans',         120, TRUE)
ON CONFLICT (id) DO NOTHING;
