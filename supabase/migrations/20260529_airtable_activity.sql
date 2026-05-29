-- Airtable activity log for John's shift cross-check.
--
-- John is the scheduler — he doesn't post on Reddit, his work is
-- captions / media / row updates inside the UNCVRD Reddit Table
-- base. We can't see those edits via row queries (no "modified by"
-- field on his tables) so instead the bot subscribes to Airtable's
-- Webhooks API: every cell change emits a payload that includes
-- *who* made it (Airtable user id) and *when*. The bot polls those
-- payloads on each /shift call, stores them here, then runs the
-- same session-based estimate it uses for Reddit posts.

CREATE TABLE IF NOT EXISTS public.airtable_activity (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,       -- Airtable user id (usrXXX...)
  ts            TIMESTAMPTZ NOT NULL,-- when the change occurred
  table_id      TEXT,                -- which table was touched
  record_id     TEXT,                -- which record (optional)
  change_kind   TEXT,                -- 'created' | 'updated'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ts, table_id, record_id, change_kind)
);

CREATE INDEX IF NOT EXISTS airtable_activity_user_ts_idx
  ON public.airtable_activity (user_id, ts DESC);

ALTER TABLE public.airtable_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.airtable_activity;
CREATE POLICY "Service role full access" ON public.airtable_activity
  FOR ALL USING (true) WITH CHECK (true);

-- Cursor bookkeeping. Airtable's webhook payloads endpoint is
-- cursor-based: you ask for "everything since cursor N" and it
-- gives you a batch + a new cursor. We persist the last cursor so
-- repeated /shift calls don't re-fetch everything.
CREATE TABLE IF NOT EXISTS public.airtable_webhook_state (
  webhook_id  TEXT PRIMARY KEY,
  cursor      BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.airtable_webhook_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.airtable_webhook_state;
CREATE POLICY "Service role full access" ON public.airtable_webhook_state
  FOR ALL USING (true) WITH CHECK (true);
