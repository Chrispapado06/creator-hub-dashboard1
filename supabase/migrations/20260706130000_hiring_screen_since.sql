-- Only screen applications submitted AFTER this cutoff. Set to now() so the
-- existing Typeform backlog is ignored and only new applicants get messaged.
ALTER TABLE public.hiring_config ADD COLUMN IF NOT EXISTS screen_since timestamptz;
UPDATE public.hiring_config SET screen_since = now() WHERE id = 1 AND screen_since IS NULL;
