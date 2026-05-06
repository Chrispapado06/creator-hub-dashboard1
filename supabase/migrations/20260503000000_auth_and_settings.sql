-- agency_settings: single row for branding and theme
CREATE TABLE public.agency_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_name TEXT NOT NULL DEFAULT 'Agency Console',
  logo_url TEXT,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.agency_settings (agency_name, theme) VALUES ('Agency Console', 'dark');
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.agency_settings FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_agency_settings_updated BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- access_codes: team members sign in with a code you create
CREATE TABLE public.access_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Your default owner code — change this in Settings after first login
INSERT INTO public.access_codes (code, label) VALUES ('AGENCY-OWNER', 'Owner');
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.access_codes FOR ALL USING (true) WITH CHECK (true);
