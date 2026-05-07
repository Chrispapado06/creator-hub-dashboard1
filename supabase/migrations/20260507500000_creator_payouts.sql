-- Creator payout system.
--
-- The agency tracks every dollar that flows from OnlyFans to the creator
-- through the agency's hands. Each payout covers a date range, pulls gross
-- revenue from the existing per-channel entries (organic + internal), takes
-- the agency cut, deducts any custom fees (ad reimbursements, processing,
-- etc.), and lands at "net to creator" — the number the creator actually
-- receives in their next bank transfer.
--
-- Status workflow: draft → sent → paid.
--   draft: still being computed/edited
--   sent : creator has been notified of the breakdown but hasn't been paid
--   paid : money has hit the creator's account
--
-- Deductions live as JSONB so the agency can attach arbitrary line items
-- per payout without schema churn.

-- Per-creator split. The number is the CREATOR's percentage of net revenue;
-- the agency keeps (100 - this). 80/20 in the creator's favor is a common
-- starting point — adjustable per creator.
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS payout_split_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  ADD COLUMN IF NOT EXISTS of_platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00;

CREATE TABLE IF NOT EXISTS public.creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,

  -- Money flow
  gross_revenue   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- everything OF paid out in the window
  of_platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,  -- OnlyFans's cut (e.g. 20%)
  agency_cut      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- agency's split after OF fee
  deductions      JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{ label: string, amount: number }]
  net_to_creator  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- the wire-transfer number

  -- Settings snapshot — preserves the math even if the creator's split
  -- changes later. Always-history-friendly.
  split_pct_snapshot NUMERIC(5,2),
  fee_pct_snapshot   NUMERIC(5,2),

  -- Workflow
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  payment_method TEXT,                -- "Wise", "Bank transfer", "Crypto", etc.
  paid_at        TIMESTAMPTZ,
  paid_by        UUID,                -- staff member who marked it paid (chatters.id)
  notes          TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator
  ON public.creator_payouts(creator_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_status
  ON public.creator_payouts(status);

ALTER TABLE public.creator_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_payouts;
CREATE POLICY "Public full access" ON public.creator_payouts FOR ALL USING (true) WITH CHECK (true);
