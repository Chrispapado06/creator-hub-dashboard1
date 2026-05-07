-- Generic agency-level expense ledger.
--
-- Ad spend lives in `ad_campaigns` and staff comp lives in `staff_payouts`,
-- but the agency also burns money on software subscriptions, rent, legal,
-- insurance, equipment, and a long tail of one-offs that have nowhere to
-- live. This table is the catch-all so the Financials page can present a
-- complete P&L instead of only the creator-attributed slice.
--
-- Category is a free-text field with a recommended set used by the UI's
-- pill filters — keeping it loose lets accountants tag whatever they need
-- without a schema migration each time.

CREATE TABLE IF NOT EXISTS public.agency_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'other',          -- software, rent, salaries, marketing, equipment, professional_services, travel, other
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT,
  notes TEXT,
  recurring BOOLEAN NOT NULL DEFAULT false,        -- flag for monthly subscriptions etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_expenses_date
  ON public.agency_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_agency_expenses_category
  ON public.agency_expenses(category);

ALTER TABLE public.agency_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.agency_expenses;
CREATE POLICY "Public full access" ON public.agency_expenses FOR ALL USING (true) WITH CHECK (true);
