-- Track when staff have been paid out for a given period.
-- Each row is one payout to one staff member for a date range.

CREATE TABLE IF NOT EXISTS public.staff_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  hours NUMERIC(10, 2),
  commission_amount NUMERIC(10, 2),
  hourly_amount NUMERIC(10, 2),
  shifts_count INTEGER,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_chatter ON public.staff_payouts(chatter_id);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_paid_at ON public.staff_payouts(paid_at DESC);
ALTER TABLE public.staff_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_payouts;
CREATE POLICY "Public full access" ON public.staff_payouts FOR ALL USING (true) WITH CHECK (true);
