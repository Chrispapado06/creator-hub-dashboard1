-- Shift-length limits + warnings.
--
-- Adds two columns:
--   • agency_settings.default_max_shift_hours — agency-wide default
--     (e.g. 8). Used for any chatter without an explicit override.
--   • chatters.max_shift_hours — per-chatter override (e.g. 4 for a
--     part-timer, 10 for a senior). NULL = use the agency default.
--
-- The Clock page reads the effective max (per-chatter || agency
-- default) when a shift is active and surfaces "30 min left" / "5 min
-- left" / "shift exceeded" warnings. The browser Notifications API
-- fires once per threshold so the chatter gets pinged even if the tab
-- is in the background.

ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS default_max_shift_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00;

ALTER TABLE public.chatters
  ADD COLUMN IF NOT EXISTS max_shift_hours NUMERIC(4,2);
