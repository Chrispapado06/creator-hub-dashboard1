-- Staff suite v3: handover notes, verified hours (anti-cheat heartbeats),
-- time-off requests, weekly availability, bonus tiers, staff onboarding
-- checklists.
--
-- ── Handover + heartbeat columns on shifts ──────────────────────────────────
-- handover_note: written at clock-out, shown to the next person clocking in
-- on the same creator. heartbeat_minutes counts minutes the staff portal tab
-- was OPEN during the shift; visible_minutes counts minutes it was the
-- FOCUSED tab. Comparing these against (end_at - start_at) gives admins a
-- "verified hours" signal to catch padded shifts.
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS handover_note TEXT,
  ADD COLUMN IF NOT EXISTS heartbeat_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- ── Time-off requests (staff submit → admin approve/deny) ───────────────────
CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_off_chatter ON public.time_off_requests(chatter_id);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON public.time_off_requests(status, start_date);
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.time_off_requests;
CREATE POLICY "Public full access" ON public.time_off_requests FOR ALL USING (true) WITH CHECK (true);

-- ── Weekly availability (staff-declared, shown in the admin rota) ───────────
-- weekday: 0 = Monday … 6 = Sunday (ISO order, matches the rota grid).
CREATE TABLE IF NOT EXISTS public.staff_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chatter_id, weekday, start_time)
);
CREATE INDEX IF NOT EXISTS idx_staff_availability_chatter ON public.staff_availability(chatter_id);
ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_availability;
CREATE POLICY "Public full access" ON public.staff_availability FOR ALL USING (true) WITH CHECK (true);

-- ── Bonus tiers (admin-defined incentives; staff see live progress) ─────────
-- metric is computed over closed shifts in the current period:
--   ppv_revenue   → SUM(ppv_revenue)
--   total_revenue → SUM(total_revenue)
--   messages      → SUM(message_count)
--   hours         → SUM(end_at - start_at)
-- role NULL = applies to every role.
CREATE TABLE IF NOT EXISTS public.staff_bonus_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  role TEXT,
  metric TEXT NOT NULL
    CHECK (metric IN ('ppv_revenue', 'total_revenue', 'messages', 'hours')),
  threshold NUMERIC(12, 2) NOT NULL,
  bonus_amount NUMERIC(10, 2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'week' CHECK (period IN ('week', 'month')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_bonus_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_bonus_tiers;
CREATE POLICY "Public full access" ON public.staff_bonus_tiers FOR ALL USING (true) WITH CHECK (true);

-- ── Rota (planned shifts) ───────────────────────────────────────────────────
-- Deliberately separate from public.shifts: shifts are WORKED time that
-- feeds payroll; rota rows are PLANNED time. Keeping them apart means a
-- scheduled shift never double-counts in payouts, and a rota row with no
-- matching worked shift is a visible no-show.
CREATE TABLE IF NOT EXISTS public.rota_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES public.creators(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_chatter ON public.rota_shifts(chatter_id, start_at);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_start ON public.rota_shifts(start_at);
ALTER TABLE public.rota_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.rota_shifts;
CREATE POLICY "Public full access" ON public.rota_shifts FOR ALL USING (true) WITH CHECK (true);

-- ── Staff onboarding checklists ─────────────────────────────────────────────
-- staff_onboarding_items is the admin-managed template (role NULL = all
-- roles); staff_onboarding_progress records per-staff completion. Note:
-- public.onboarding_tasks already exists but belongs to CREATOR onboarding —
-- these tables are intentionally separate.
CREATE TABLE IF NOT EXISTS public.staff_onboarding_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  description TEXT,
  role TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_onboarding_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_onboarding_items;
CREATE POLICY "Public full access" ON public.staff_onboarding_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.staff_onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID NOT NULL REFERENCES public.chatters(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.staff_onboarding_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by TEXT,
  UNIQUE (chatter_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_onboarding_progress_chatter
  ON public.staff_onboarding_progress(chatter_id);
ALTER TABLE public.staff_onboarding_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.staff_onboarding_progress;
CREATE POLICY "Public full access" ON public.staff_onboarding_progress FOR ALL USING (true) WITH CHECK (true);
