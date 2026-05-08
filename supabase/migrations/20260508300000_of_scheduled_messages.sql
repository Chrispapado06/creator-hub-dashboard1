-- Local mirror of mass DMs we've scheduled / sent through the OF API.
--
-- The OF API does have a /queue/messages endpoint we can read back, but
-- mirroring scheduled blasts locally is faster (one query vs API roundtrip
-- on every page load) and gives us a place to track:
--   • who in the agency scheduled the blast
--   • whether the API call succeeded
--   • the recipient strategy used (active / list / explicit ids)
--   • the OF queue id once it's accepted, for cross-reference
--
-- Status workflow:
--   draft     → admin is still composing
--   scheduled → posted to OF queue with a scheduledAt in the future
--   sent      → posted to OF immediately (no scheduledAt) and accepted
--   failed    → API rejected; error_message holds the reason
--   cancelled → admin pulled it before delivery (calls OF cancel endpoint)

CREATE TABLE IF NOT EXISTS public.of_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Local creator the message belongs to (for sidebar grouping +
  -- per-creator analytics). FK so deleting the creator cleans up.
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- OnlyFansAPI account id (the /api/{account}/... segment) — string
  -- because OF returns it that way.
  of_account_id TEXT NOT NULL,
  -- Composer state
  text TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  media_ids JSONB NOT NULL DEFAULT '[]'::jsonb,        -- numeric OF media ids
  -- Audience strategy
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all','active','expired','list','userIds')),
  recipient_list_id BIGINT,                            -- when type='list'
  recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,-- when type='userIds'
  -- Schedule
  scheduled_at TIMESTAMPTZ,                            -- NULL = send immediately
  -- Workflow
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','sent','failed','cancelled')),
  of_queue_id BIGINT,                                  -- returned by OF on accept
  error_message TEXT,
  -- Audit
  created_by UUID REFERENCES public.chatters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ                                  -- set on successful API call
);

CREATE INDEX IF NOT EXISTS idx_of_scheduled_creator
  ON public.of_scheduled_messages(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_of_scheduled_status
  ON public.of_scheduled_messages(status, scheduled_at);

ALTER TABLE public.of_scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_scheduled_messages;
CREATE POLICY "Public full access" ON public.of_scheduled_messages FOR ALL USING (true) WITH CHECK (true);
