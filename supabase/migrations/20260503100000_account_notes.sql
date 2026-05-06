-- Add notes column to reddit_accounts for quick inline notes
ALTER TABLE public.reddit_accounts ADD COLUMN IF NOT EXISTS notes TEXT;
