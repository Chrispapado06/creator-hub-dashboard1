-- Split access_codes into admin vs staff accounts.
-- Staff accounts are linked to a chatters row so the staff portal knows which
-- staff member is logged in. Admin accounts have chatter_id = NULL.

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS chatter_id UUID REFERENCES public.chatters(id) ON DELETE CASCADE;

ALTER TABLE public.access_codes DROP CONSTRAINT IF EXISTS access_codes_account_type_check;
ALTER TABLE public.access_codes ADD CONSTRAINT access_codes_account_type_check
  CHECK (account_type IN ('admin', 'staff'));

CREATE INDEX IF NOT EXISTS idx_access_codes_chatter_id
  ON public.access_codes(chatter_id) WHERE chatter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_codes_type
  ON public.access_codes(account_type);
