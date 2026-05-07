-- Client acquisition CRM upgrade: activities, tasks, templates, and an
-- agency-level ScrapeCreators API key for lead enrichment from social handles.

-- Activity log — every touch with a lead, ordered chronologically
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.creator_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'dm_sent', 'reply_received', 'call', 'meeting',
    'contract_sent', 'follow_up', 'note', 'status_change', 'other'
  )),
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_occurred ON public.lead_activities(occurred_at DESC);
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.lead_activities;
CREATE POLICY "Public full access" ON public.lead_activities FOR ALL USING (true) WITH CHECK (true);

-- Tasks — follow-ups with optional due date
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.creator_leads(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_id ON public.lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due ON public.lead_tasks(due_at) WHERE completed_at IS NULL;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.lead_tasks;
CREATE POLICY "Public full access" ON public.lead_tasks FOR ALL USING (true) WITH CHECK (true);

-- DM template library
CREATE TABLE IF NOT EXISTS public.lead_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.lead_templates;
CREATE POLICY "Public full access" ON public.lead_templates FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_lead_templates_updated ON public.lead_templates;
CREATE TRIGGER trg_lead_templates_updated BEFORE UPDATE ON public.lead_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Agency-level ScrapeCreators API key (used by lead enrichment from IG/TikTok handles)
ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS scrapecreators_api_key TEXT;
