-- Multi-channel revenue tables

CREATE TABLE IF NOT EXISTS public.organic_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  sub_count INTEGER,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.internal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL DEFAULT 'other',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'other',
  amount_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  revenue_generated NUMERIC(10,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.revenue_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'total',
  target_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organic_entries_creator_id_idx ON public.organic_entries(creator_id);
CREATE INDEX IF NOT EXISTS organic_entries_entry_date_idx ON public.organic_entries(entry_date);
CREATE INDEX IF NOT EXISTS internal_entries_creator_id_idx ON public.internal_entries(creator_id);
CREATE INDEX IF NOT EXISTS internal_entries_entry_date_idx ON public.internal_entries(entry_date);
CREATE INDEX IF NOT EXISTS ad_campaigns_creator_id_idx ON public.ad_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_start_date_idx ON public.ad_campaigns(start_date);
CREATE INDEX IF NOT EXISTS revenue_goals_creator_id_idx ON public.revenue_goals(creator_id);
