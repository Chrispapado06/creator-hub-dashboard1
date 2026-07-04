-- AI applicant screening. Typeform replies are polled server-side, scored by
-- Claude against the configured requirements, stored here, and (fully-automatic)
-- a Telegram message goes to the team's hiring channel on a pass.

CREATE TABLE IF NOT EXISTS public.applicants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id  text UNIQUE,               -- Typeform response token (dedup)
  name         text,
  email        text,
  telegram     text,
  role         text,
  answers      jsonb,                      -- [{ q, a }]
  ai_verdict   text,                       -- pass | maybe | no
  ai_score     integer,                    -- 0-100
  ai_reason    text,
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','messaged','hired','rejected')),
  messaged     boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applicants_created ON public.applicants (created_at DESC);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.applicants;
CREATE POLICY "Public full access" ON public.applicants FOR ALL USING (true) WITH CHECK (true);

-- Single-row config the admin edits in the UI.
CREATE TABLE IF NOT EXISTS public.hiring_config (
  id               integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  requirements     text,
  min_score        integer NOT NULL DEFAULT 70,
  typeform_form_id text,
  telegram_chat_id text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hiring_config (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.hiring_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.hiring_config;
CREATE POLICY "Public full access" ON public.hiring_config FOR ALL USING (true) WITH CHECK (true);
