-- Automation rules: lightweight if-this-then-that engine.
--
-- Rules are evaluated by the browser-side auto-sync orchestrator (same one
-- that runs Reddit + Infloww sync every 2h). Each enabled rule is checked
-- against the current state of the database; if its trigger matches an entity
-- (creator, link, etc.), the rule's action fires.
--
-- Idempotency is enforced by `rule_fires` — a rule won't refire for the same
-- entity until cooldown_hours has elapsed.

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- What condition fires the rule
  trigger TEXT NOT NULL CHECK (trigger IN (
    'creator_dormant',          -- creator has had no revenue in N days
    'subreddit_low_cvr',        -- a tracked link's recent CVR < threshold
    'shift_zero_revenue',       -- a chatter logged a shift with no revenue
    'document_expiring',        -- a creator_documents row expires within N days
    'goal_period_ending',       -- a creator goal's period_end is within N days
    'ads_roas_below'            -- a Meta ad campaign's ROAS dropped below threshold
  )),
  -- Free-form params per trigger type (e.g. { "days": 14 })
  trigger_params JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- What happens when it matches
  action TEXT NOT NULL CHECK (action IN (
    'audit_entry',              -- write a row to audit_log
    'coaching_note',            -- create a staff_coaching_note (for chatter triggers)
    'lead_task',                -- create a lead_tasks row (for lead-related triggers)
    'pin_announcement'          -- post a staff_announcements row (pinned)
  )),
  action_params JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- How long after firing for one entity before it can refire for the same one
  cooldown_hours INTEGER NOT NULL DEFAULT 24,

  -- Bookkeeping
  fire_count INTEGER NOT NULL DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  last_evaluated_at TIMESTAMPTZ,
  last_eval_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled
  ON public.automation_rules(enabled);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.automation_rules;
CREATE POLICY "Public full access" ON public.automation_rules FOR ALL USING (true) WITH CHECK (true);

-- One row per (rule, entity, time) — used for cooldown checks. We never
-- delete from here; the audit value is real.
CREATE TABLE IF NOT EXISTS public.rule_fires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,    -- 'creator' | 'tracked_link' | 'shift' | 'document' | 'goal' | 'ad_campaign'
  entity_id TEXT NOT NULL,
  details TEXT,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rule_fires_rule
  ON public.rule_fires(rule_id, entity_id, fired_at DESC);

ALTER TABLE public.rule_fires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.rule_fires;
CREATE POLICY "Public full access" ON public.rule_fires FOR ALL USING (true) WITH CHECK (true);

-- Register the rules job in the auto-sync orchestrator so the badge shows it
-- alongside the platform syncs.
INSERT INTO public.sync_status (id, interval_minutes, auto_enabled) VALUES
  ('automation_rules', 60, TRUE)
ON CONFLICT (id) DO NOTHING;
