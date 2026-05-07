-- Geographic enrichment for landing_views.
--
-- Each visit gets a country/city/region tag captured client-side from a free
-- IP-geo lookup (ipapi.co) at view time. Coarse-grained, no server cost,
-- and good enough for "where are visitors coming from" panels.
--
-- The columns are nullable — if the geo lookup fails (rate-limited, blocked,
-- offline), the view still records, just without geo. Better than dropping
-- the visit entirely.

ALTER TABLE public.landing_views
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT;

-- Composite index for "top countries for landing X" aggregations
CREATE INDEX IF NOT EXISTS idx_landing_views_country
  ON public.landing_views(landing_id, country);
