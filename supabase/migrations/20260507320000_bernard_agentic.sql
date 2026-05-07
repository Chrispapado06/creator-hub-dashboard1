-- Bernard agentic config: stores the Airtable PAT (personal access token)
-- so Bernard can read + write to your Airtable bases on demand.
--
-- The PAT is scoped — admins generate it in airtable.com/create/tokens and
-- pick which bases + permissions it gets. We never call airtable.com from
-- the server; everything goes browser-direct against the Airtable REST API.

ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS airtable_api_key TEXT;
