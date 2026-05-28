-- Shift approval system.
--
-- Posters submit a shift via the /shift slash command in Discord with
-- their clock-in/out times, the accounts they posted to, and a proof
-- screenshot. The bot cross-checks against actual Reddit posting
-- activity (session-based estimate that tolerates the realistic
-- 5-15 min gap between posts), then a manager approves / adjusts /
-- rejects via interactive buttons.
--
-- All shift records — including the proof image, the cross-check
-- estimate, and the final approved amount — live in this table so
-- audits can pull the full history any time.

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who submitted (Discord user that ran /shift).
  discord_user_id   TEXT NOT NULL,
  discord_username  TEXT,
  poster_name       TEXT,            -- our POSTERS[].name if we can map them, else NULL

  -- Submitted window (in UK time, stored as UTC).
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  claimed_minutes   INTEGER NOT NULL,

  -- Accounts the poster says they worked on this shift. Bot uses
  -- these for the cross-check; if NULL, we fall back to the
  -- poster's full account roster in reddit-lib.
  accounts          TEXT[],

  -- Proof of work: Discord CDN URL (short-lived) + our own
  -- permanent copy uploaded to the shift-proofs storage bucket.
  proof_discord_url TEXT,
  proof_storage_path TEXT,

  -- Cross-check output (computed at submission time).
  estimated_minutes INTEGER,          -- session-based estimate
  reddit_post_count INTEGER,
  reddit_session_count INTEGER,
  tolerance         TEXT,             -- 'within' | 'slightly_over' | 'flagged' | 'under'

  -- Approval workflow.
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'adjusted', 'rejected')),
  approved_minutes  INTEGER,          -- final amount paid (may differ from claimed)
  approved_by_discord_user_id TEXT,
  approved_by_username TEXT,
  approved_at       TIMESTAMPTZ,
  reject_reason     TEXT,

  -- Where the approval embed lives so we can edit it later.
  approval_message_id TEXT,
  approval_channel_id TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shifts_user_status_idx ON public.shifts (discord_user_id, status);
CREATE INDEX IF NOT EXISTS shifts_status_idx      ON public.shifts (status);
CREATE INDEX IF NOT EXISTS shifts_start_idx       ON public.shifts (start_at DESC);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.shifts;
CREATE POLICY "Service role full access" ON public.shifts
  FOR ALL USING (true) WITH CHECK (true);

-- Bucket for proof-of-work screenshots. Marked private; the bot
-- accesses it via the service-role key from the Discord function.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('shift-proofs', 'shift-proofs', false)
  ON CONFLICT (id) DO NOTHING;
