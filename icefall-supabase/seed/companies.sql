-- ICEFALL — CANONICAL COMPANIES. GENERATED from icefall-shared/companies.ts.
-- 8 companies, every one INVENTED (decision 2). Verification is
-- downgraded to 'pending' on load: see catalogue.sql's header for why.

begin;

insert into public.companies
  (id, slug, name, legal_name, description, countries, regions, status, verification_status) values
  ('c0000000-0000-4000-8000-000000000001', 'solukhumbu-expeditions', 'Solukhumbu Expeditions', 'Solukhumbu Expeditions Pvt Ltd', 'A high-altitude operator working mainly on Everest and Ama Dablam, with guides, Sherpas and support staff who return to the same mountains season after season.', array['Nepal'], array['Khumbu', 'Mahalangur Himal'], 'active', 'pending'),
  ('c0000000-0000-4000-8000-000000000002', 'lantern-ridge-expeditions', 'Lantern Ridge Expeditions', 'Lantern Ridge Expeditions Pvt Ltd', 'Started by two climbing sirdars who had spent a decade working other people''s expeditions and wanted to run them differently: smaller teams, longer acclimatisation, and a turn-around call that belongs to the guide on the ground rather than to an office.', array['Nepal'], array['Khumbu'], 'active', 'pending'),
  ('c0000000-0000-4000-8000-000000000003', 'northwind-ascents', 'Northwind Ascents', 'Northwind Ascents Pvt Ltd', 'Expedition logistics on the 8,000 m peaks of Nepal and Pakistan, running fixed departures with their own rope-fixing team rather than buying into a shared line.', array['Nepal', 'Pakistan'], array['Karakoram', 'Mahalangur Himal'], 'active', 'pending'),
  ('c0000000-0000-4000-8000-000000000004', 'cordillera-ascents', 'Cordillera Ascents', null, 'A Huaraz-based team working the Cordillera Blanca and Huayhuash, mostly on Alpamayo and Huascarán, with acclimatisation built around the valleys rather than a fixed schedule.', array['Peru', 'Bolivia'], array['Cordillera Blanca', 'Cordillera Real'], 'active', 'pending'),
  ('c0000000-0000-4000-8000-000000000005', 'hollow-ridge-mountaineering', 'Hollow Ridge Mountaineering', null, 'Alpine-style ascents in the Mont Blanc massif and the Dolomites, running small rope teams and refusing groups larger than four on technical ground.', array['Italy', 'France'], array['Mont Blanc massif', 'Dolomites'], 'onboarding', 'unverified'),
  ('c0000000-0000-4000-8000-000000000006', 'halvorsen-alpine', 'Halvorsen Alpine', 'Halvorsen Alpine AS', 'Ski touring and winter ascents in the Lyngen Alps and Jotunheimen, with a season that runs opposite to most of the catalogue.', array['Norway'], array['Lyngen Alps', 'Jotunheimen'], 'active', 'unverified'),
  ('c0000000-0000-4000-8000-000000000007', 'cold-harbour-guides', 'Cold Harbour Guides', 'Cold Harbour Guides Ltd', 'Scottish winter and Alpine summer, operating out of Fort William. Suspended pending a review of their insurance documentation.', array['United Kingdom'], array['Scottish Highlands'], 'suspended', 'suspended'),
  ('c0000000-0000-4000-8000-000000000008', 'falkenrath-expeditions', 'Falkenrath Expeditions', 'Falkenrath Expeditions GmbH', 'Austrian operator running 6,000 m and 7,000 m objectives across the Andes and the Pamir, with a long acclimatisation programme and no fixed summit day.', array['Austria', 'Argentina', 'Kyrgyzstan'], array['Andes', 'Pamir'], 'prospect', 'unverified')
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, legal_name = excluded.legal_name,
  description = excluded.description, countries = excluded.countries,
  regions = excluded.regions, status = excluded.status,
  verification_status = excluded.verification_status;

commit;
