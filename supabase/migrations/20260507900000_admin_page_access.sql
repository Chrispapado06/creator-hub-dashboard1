-- Per-admin page-level access control.
--
-- Adds an `allowed_pages` text array to `access_codes`. The convention
-- the rest of the app follows:
--
--   NULL or empty array  → full access (effectively super-admin, can
--                          manage other admins, see /settings, etc).
--   non-empty array      → restricted: the admin only sees the listed
--                          page slugs in the sidebar. The /login flow
--                          stores this on the session so the sidebar
--                          and route guards filter consistently.
--
-- Page slugs match the route name ('daily', 'revenue', 'reddit',
-- 'financials', 'bernard', 'ads', etc.). The home page (Creators) uses
-- the slug 'creators' to avoid an empty string.
--
-- Staff (account_type = 'staff') users are unaffected — they always
-- land on /clock regardless. This column only matters for admins.

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS allowed_pages TEXT[];

-- No data backfill needed: existing rows with NULL allowed_pages keep
-- full access, which matches the historical behavior.
