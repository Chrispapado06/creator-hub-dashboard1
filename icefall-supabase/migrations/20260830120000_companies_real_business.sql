-- `real_business` on public.companies — the column the disclosure guard needs.
--
-- FOUND WHEN A REAL COMPANY LANDED IN THE DATABASE BY ACCIDENT. Testing the new
-- CRM page editor created a row for "Elite Exped" — a REAL, identifiable
-- expedition operator, and the one real name owner decision 2 did not manage to
-- remove from `icefall-web`. The row was removed. The gap it exposed was not.
--
-- THE GAP. `icefall-shared/companies.ts` carries `realBusiness: boolean`, and
-- `icefall-web/src/components/RealBusiness.tsx` gates the whole disclosure on it:
--
--     if (!company?.realBusiness) return null;
--
-- That component exists precisely so a page structurally cannot render a real
-- operator without the disclosure travelling with it. It was written against the
-- FIXTURE. This table had no such column — so a company read from the database
-- arrives with `realBusiness === undefined`, which is falsy, and **the guard
-- returns null and renders nothing at all.**
--
-- The guard does not fail loudly. It fails by staying silent, on exactly the
-- listing where silence is the problem: a real business shown beside invented
-- ratings and prices with no notice that it is real. Every app is about to stop
-- reading fixtures and start reading this table, which is the moment the fixture
-- guard quietly stops covering anything.
--
-- DEFAULT FALSE, NOT NULL. A company is invented until somebody says otherwise,
-- and there must be no third state: `null` would be "we do not know", which for
-- this question resolves to the same silent non-disclosure. The safe default is
-- the one that costs a fictional company an unnecessary banner, never the one
-- that costs a real company its disclosure.

alter table public.companies
  add column if not exists real_business boolean not null default false;

comment on column public.companies.real_business is
  'TRUE only for a real, identifiable business. Keys the disclosure banner in icefall-web''s RealBusiness.tsx, which returns null when this is falsy — so a missing value silently suppresses the notice rather than raising. Never accepted from an operator draft: previewProtocol.ts rejects it explicitly.';
