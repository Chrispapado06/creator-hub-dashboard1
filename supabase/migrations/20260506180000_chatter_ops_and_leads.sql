-- Chatter operations + creator-acquisition pipeline (CRM).
-- Four new tables: chatters, chatter_assignments, shifts, creator_leads.

-- Chatters: the people who DM fans on behalf of creators
CREATE TABLE IF NOT EXISTS public.chatters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  hourly_rate NUMERIC(10, 2),
  languages TEXT,
  hire_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chatters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.chatters;
CREATE POLICY "Public full access" ON public.chatters FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_chatters_updated ON public.chatters;
CREATE TRIGGER trg_chatters_updated BEFORE UPDATE ON public.chatters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Which chatters are assigned to which creators (M:N)
CREATE TABLE IF NOT EXISTS public.chatter_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chatter_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_chatter_assignments_chatter ON public.chatter_assignments(chatter_id);
CREATE INDEX IF NOT EXISTS idx_chatter_assignments_creator ON public.chatter_assignments(creator_id);
ALTER TABLE public.chatter_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.chatter_assignments;
CREATE POLICY "Public full access" ON public.chatter_assignments FOR ALL USING (true) WITH CHECK (true);

-- Shifts: each chatter session for a creator, with sales tracked
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  ppv_count INTEGER NOT NULL DEFAULT 0,
  ppv_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tips_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
  custom_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  avg_response_seconds INTEGER,
  quality_flag TEXT CHECK (quality_flag IN ('off_brand', 'missed_ppv', 'inappropriate', 'late', 'other') OR quality_flag IS NULL),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shifts_chatter ON public.shifts(chatter_id);
CREATE INDEX IF NOT EXISTS idx_shifts_creator ON public.shifts(creator_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_at ON public.shifts(start_at DESC);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.shifts;
CREATE POLICY "Public full access" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

-- Creator leads: pipeline for signing new creators (CRM-style)
CREATE TABLE IF NOT EXISTS public.creator_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  handle TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'outreach', 'replied', 'negotiating', 'signed', 'lost')),
  source_platform TEXT,
  contact_method TEXT,
  contact_value TEXT,
  follower_estimate INTEGER,
  notes TEXT,
  signed_at DATE,
  lost_reason TEXT,
  creator_id UUID REFERENCES public.creators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_leads_status ON public.creator_leads(status);
ALTER TABLE public.creator_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_leads;
CREATE POLICY "Public full access" ON public.creator_leads FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_creator_leads_updated ON public.creator_leads;
CREATE TRIGGER trg_creator_leads_updated BEFORE UPDATE ON public.creator_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
