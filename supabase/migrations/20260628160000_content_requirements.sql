-- Phase B: the weekly content brief the agency writes for each creator, shown
-- on the creator-facing portal. (Creator logins reuse access_codes with
-- account_type = 'creator' and label = the creator's name — no schema change.)

ALTER TABLE public.content_tracker ADD COLUMN IF NOT EXISTS requirements text;
