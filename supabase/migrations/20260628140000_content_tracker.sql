-- Weekly content tracker: one row per creator per week, moving through the
-- content pipeline. Drives the Content dashboard + the tracker-based digest
-- reminders (Gly bump / Finlay+Luca QC / Luca Monday pay).

CREATE TABLE IF NOT EXISTS public.content_tracker (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator     text NOT NULL,
  week_start  date NOT NULL,                       -- Monday of the week
  stage       text NOT NULL DEFAULT 'requested'
              CHECK (stage IN ('requested','received','qc','uploaded')),
  doc_link    text,
  file_path   text,
  file_name   text,
  pay_amount  numeric,
  pay_status  text NOT NULL DEFAULT 'unpaid' CHECK (pay_status IN ('unpaid','paid')),
  notes       text,
  last_bumped date,                                -- last time Gly was nudged to bump
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator, week_start)
);

CREATE INDEX IF NOT EXISTS idx_content_tracker_week ON public.content_tracker (week_start);
ALTER TABLE public.content_tracker ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.content_tracker;
CREATE POLICY "Public full access" ON public.content_tracker FOR ALL USING (true) WITH CHECK (true);
