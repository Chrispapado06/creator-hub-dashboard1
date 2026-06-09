-- UNCVRD Daily Outreach Tracker — VAs ("posters") log their daily
-- engagement work via a Telegram bot; one end-of-day digest is sent to
-- one person.
--
-- The bot lives in `daily-data-bot/`:
--   bot.mjs    — guided Q&A: a VA sends /report and answers one field at
--                a time. Each finished report becomes one entry row.
--   digest.mjs — once a day, compiles every entry for today (UK) into a
--                single report and sends it to the recipient.
--
--   daily_outreach_entries  — one row per submitted report (a VA's shift
--                             of follows / comments / likes / posts).
--   daily_outreach_sessions — in-flight guided-Q&A state, one row per VA
--                             currently filling out a report. Deleted on
--                             completion or /cancel.
--   daily_outreach_state    — singleton; the last Telegram update_id the
--                             bot processed, so a restart never re-handles
--                             or double-prompts the same message.
--
-- Single-user internal tool: RLS on with permissive policies, matching the
-- ad_tracker / keyword_attribution migrations. All writes are made by the
-- bot with the service-role key.

-- ── daily_outreach_entries ───────────────────────────────────────────
-- One row per completed report. report_date is the working day (UK) the
-- entry counts toward — the digest groups on it.
CREATE TABLE IF NOT EXISTS public.daily_outreach_entries (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date    DATE NOT NULL,
  tg_user_id     BIGINT NOT NULL,            -- Telegram user id of the VA
  va_name        TEXT NOT NULL,              -- @username or first name
  dms_sent       BOOLEAN NOT NULL DEFAULT false, -- have you sent the DMs?
  needed_post    BOOLEAN NOT NULL DEFAULT false, -- did you need to post today?
  posted_stories BOOLEAN NOT NULL DEFAULT false, -- have you posted stories?
  commented      BOOLEAN NOT NULL DEFAULT false, -- have you commented under posts?
  liked          BOOLEAN NOT NULL DEFAULT false, -- have you liked posts?
  completed      BOOLEAN NOT NULL DEFAULT false, -- fully completed for today?
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_outreach_entries_date
  ON public.daily_outreach_entries (report_date);

-- ── daily_outreach_sessions ──────────────────────────────────────────
-- Guided-Q&A state for a VA mid-report. One row per VA; the bot upserts
-- on tg_user_id as the conversation advances and deletes it when done.
CREATE TABLE IF NOT EXISTS public.daily_outreach_sessions (
  tg_user_id BIGINT PRIMARY KEY,
  chat_id    BIGINT NOT NULL,            -- where to reply (DM or group)
  va_name    TEXT NOT NULL,
  step       INTEGER NOT NULL DEFAULT 0, -- index into FIELDS
  draft      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── daily_outreach_state ─────────────────────────────────────────────
-- Singleton (id = 1). Telegram long-poll cursor so restarts are clean.
CREATE TABLE IF NOT EXISTS public.daily_outreach_state (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  last_update_id BIGINT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_outreach_state_singleton CHECK (id = 1)
);
INSERT INTO public.daily_outreach_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── RLS (permissive: single-user internal tool) ──────────────────────
ALTER TABLE public.daily_outreach_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_outreach_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_outreach_state    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_outreach_entries', 'daily_outreach_sessions', 'daily_outreach_state']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t || '_all', t
    );
  END LOOP;
END $$;
