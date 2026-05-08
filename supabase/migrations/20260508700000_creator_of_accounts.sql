-- Multi-OnlyFans-account support per creator.
--
-- A creator can run multiple OnlyFans pages (e.g. main + free trial + a
-- second persona). Up until now `creators.of_username` and
-- `creators.onlyfansapi_acct_id` only held one. This migration adds a
-- child table that holds ALL of a creator's OF accounts. The legacy
-- columns on `creators` still exist and continue to point at the
-- "primary" account so existing reads keep working without touching
-- every site that queries them.
--
-- Aggregations across all of a creator's OF pages (revenue, fan count,
-- earnings sync) read this table. Single-account queries continue to
-- read the legacy columns on `creators` (no change needed).

CREATE TABLE IF NOT EXISTS public.creator_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- OnlyFans username (without @). Required.
  of_username TEXT NOT NULL,
  -- OnlyFansAPI account id (resolved on first sync). Nullable until
  -- a sync has run for this account.
  onlyfansapi_acct_id TEXT,
  -- Free-text label so admins can distinguish accounts at a glance.
  -- Examples: "main", "free trial", "fetish", "OF backup".
  label TEXT,
  -- Exactly one row per creator should be is_primary=true (enforced by
  -- a partial unique index below). Primary mirrors the legacy
  -- creators.of_username column so old code paths keep working.
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_of_accounts_unique_username
  ON public.creator_of_accounts(creator_id, of_username);
CREATE INDEX IF NOT EXISTS idx_creator_of_accounts_creator
  ON public.creator_of_accounts(creator_id);
-- Partial unique: only one primary per creator. Lets us upsert by
-- creator_id+is_primary without conflicts when adding a non-primary.
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_of_accounts_one_primary
  ON public.creator_of_accounts(creator_id) WHERE is_primary;

ALTER TABLE public.creator_of_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_of_accounts;
CREATE POLICY "Public full access" ON public.creator_of_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Backfill: copy every existing primary OF identity into the new table.
-- Skip rows where the creator has no of_username set. Only insert when
-- the creator has NO rows at all in creator_of_accounts — protects
-- against re-runs where (a) a previous run already backfilled this
-- creator, OR (b) admins added a secondary account before backfill.
-- Without this NOT EXISTS guard, a re-run can conflict with the
-- partial-unique-on-is_primary index when of_username has changed
-- between the two source tables.
INSERT INTO public.creator_of_accounts (creator_id, of_username, onlyfansapi_acct_id, is_primary, label)
SELECT c.id, c.of_username, c.onlyfansapi_acct_id, true, 'main'
FROM public.creators c
WHERE c.of_username IS NOT NULL
  AND c.of_username <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.creator_of_accounts a WHERE a.creator_id = c.id
  );
