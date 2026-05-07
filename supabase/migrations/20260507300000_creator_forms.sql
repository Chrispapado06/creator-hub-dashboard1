-- Form templates + per-creator submission tracking.
--
-- Templates live at the agency level (one template = "2024 DMCA Authorization"
-- with a master Typeform/Google Forms/DocuSign URL). Each creator gets a
-- submission row tracking whether they've completed it.

CREATE TABLE IF NOT EXISTS public.creator_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  description TEXT,
  -- Provider hint — used for the icon + ('docusign' = uses signed_at, 'google_form' / 'typeform' / 'other' use submitted_at)
  provider TEXT NOT NULL DEFAULT 'other' CHECK (provider IN (
    'google_form', 'typeform', 'docusign', 'jotform', 'tally', 'other'
  )),
  -- The master share URL the admin distributes
  master_url TEXT,
  category TEXT,                            -- 'tax', 'legal', 'onboarding', 'brand', 'other' — purely for grouping
  required_for_active BOOLEAN NOT NULL DEFAULT FALSE,
  -- When marked submitted, optionally auto-create a creator_documents row pointing at the response URL.
  -- Useful for compliance: every signed contract becomes a document on file.
  archive_as_document BOOLEAN NOT NULL DEFAULT FALSE,
  document_category TEXT,                   -- which category to use for the auto-created document (defaults to 'agreement')
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_templates_order
  ON public.creator_form_templates(display_order, label);
ALTER TABLE public.creator_form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_form_templates;
CREATE POLICY "Public full access" ON public.creator_form_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.creator_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.creator_form_templates(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- not sent yet
    'sent',        -- link distributed to creator, awaiting response
    'submitted',   -- creator submitted the form
    'declined',    -- creator declined / refused
    'expired'      -- link expired without action
  )),
  -- A per-creator URL — if the admin generates pre-filled links per creator, save that here
  share_url TEXT,
  -- The URL of THIS creator's specific response (Typeform's individual response URL, DocuSign envelope URL, etc.)
  submission_url TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  marked_by TEXT,                           -- admin username who marked it submitted (manual flow)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_creator
  ON public.creator_form_submissions(creator_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template
  ON public.creator_form_submissions(template_id, status);
ALTER TABLE public.creator_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_form_submissions;
CREATE POLICY "Public full access" ON public.creator_form_submissions FOR ALL USING (true) WITH CHECK (true);

-- ── Landing-page polish: verified mark + media gallery ─────────────────────

ALTER TABLE public.creator_landing_pages
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.creator_landing_pages
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;
