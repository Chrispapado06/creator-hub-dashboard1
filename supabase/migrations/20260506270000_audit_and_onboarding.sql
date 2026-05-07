-- Audit log: who-did-what across the app, for accountability + the
-- notifications feed. Append-only.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  details TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.audit_log;
CREATE POLICY "Public full access" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- Onboarding checklist per creator
CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, task_key)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_creator ON public.onboarding_tasks(creator_id);
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.onboarding_tasks;
CREATE POLICY "Public full access" ON public.onboarding_tasks FOR ALL USING (true) WITH CHECK (true);

-- Allow VITE_ANTHROPIC_API_KEY to be set agency-wide for the AI weekly digest
ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
