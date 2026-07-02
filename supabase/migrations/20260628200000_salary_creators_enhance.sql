-- Standard weekly rate per creator — auto-fills the pay amount on new weeks.
CREATE TABLE IF NOT EXISTS public.creator_rates (
  creator     text PRIMARY KEY,
  weekly_rate numeric,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_rates;
CREATE POLICY "Public full access" ON public.creator_rates FOR ALL USING (true) WITH CHECK (true);

-- Who uploaded the content (creator via portal vs admin) + when.
ALTER TABLE public.content_tracker ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.content_tracker ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
