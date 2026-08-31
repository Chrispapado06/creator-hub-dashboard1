-- ICEFALL — fill the commercial pages with FICTIONAL data (30 Aug 2026).
--
-- The owner asked for every CRM page to show content ("fill all of them in").
-- This file fills what can be filled WITHOUT inventing people: every row below
-- keys to an invented company, never to a person. Leads, bookings, commissions,
-- customer accounts and guide profiles all require real `profiles` rows, which
-- require real logins — and this project's standing ruling (crm_seed.sql:180)
-- is that we do not insert into auth.users. Those pages fill when real people
-- exist, and this file honestly does not try.
--
-- EVERY COMPANY REFERENCED IS INVENTED (crm_seed's four). Looked up BY SLUG so
-- the file works on any database that has them and skips cleanly where one is
-- missing. Every section is idempotent: run twice, get one dataset.
--
-- ONE REAL ATTRIBUTION, STATED: `payments.recorded_by` and the checked
-- document's `checked_by` refuse NULL/need a person, so they use the first
-- admin profile (on the live database: the owner). The rows say "seed" in
-- their note/reference fields so nobody reads them as that person's work.
--
-- Standalone on purpose: does NOT require crm_seed.sql first, and inserts no
-- placements or content versions (live already holds placements; a slot
-- collision inside one transaction would abort the whole file).

begin;

do $$
declare
  v_nw uuid;  -- Northwind Ascents
  v_ss uuid;  -- Serac & Stone
  v_cc uuid;  -- Cairn & Compass
  v_hr uuid;  -- Hollow Ridge
  v_admin uuid;
  v_inv uuid;
begin
  -- The live database (seed/companies.sql) and the local seed (crm_seed.sql)
  -- hold DIFFERENT invented companies. Each lookup accepts both, preferring
  -- whichever exists, so this file fills either database without editing.
  select id into v_nw from public.companies where slug = 'northwind-ascents';
  select id into v_ss from public.companies
    where slug = any(array['cordillera-ascents', 'serac-and-stone']) limit 1;
  select id into v_cc from public.companies
    where slug = any(array['halvorsen-alpine', 'cairn-and-compass']) limit 1;
  select id into v_hr from public.companies
    where slug = any(array['hollow-ridge-mountaineering', 'hollow-ridge']) limit 1;
  select p.id into v_admin
    from public.profiles p join public.staff_members s on s.profile_id = p.id
    where s.active order by p.created_at limit 1;

  if v_nw is null or v_ss is null or v_cc is null then
    raise notice 'fill_commercial: invented companies missing; run the companies seed first. Nothing inserted.';
    return;
  end if;

  /* ---- Deals — the pipeline, every stage represented ------------------- */
  if not exists (select 1 from public.deals where title = 'Everest 2027 flagship placement') then
    insert into public.deals (company_id, title, stage, estimated_value_cents, probability_pct, mountains, expected_close_on, lost_reason, notes) values
      (v_nw, 'Everest 2027 flagship placement',      'prospect',     560000,  null, array['everest'],    '2026-10-15', null, 'Heard of us via the waitlist page.'),
      (v_ss, 'Aconcagua season bundle',              'prospect',     320000,  null, array['aconcagua'],  '2026-10-01', null, null),
      (v_cc, 'Mont Blanc summer treks',              'contacted',    410000,  20,   array['mont-blanc'], '2026-09-28', null, 'Intro email answered same day.'),
      (v_nw, 'Manaslu autumn placement',             'contacted',    null,    null, array['manaslu'],    null,         null, 'Value not discussed yet.'),
      (v_ss, 'Denali West Buttress feature',         'conversation', 480000,  35,   array['denali'],     '2026-09-20', null, null),
      (v_cc, 'Matterhorn guided weeks',              'conversation', 275000,  30,   array['matterhorn'], '2026-09-25', null, null),
      (v_nw, 'Everest Slot 2 renewal package',       'proposal',     640000,  60,   array['everest'],    '2026-09-12', null, 'Proposal sent 26 Aug.'),
      (v_ss, 'Patagonia expansion pilot',            'proposal',     390000,  55,   array['aconcagua'],  '2026-09-18', null, null),
      (v_cc, 'Alps multi-mountain bundle',           'negotiation',  520000,  80,   array['mont-blanc','matterhorn'], '2026-09-05', null, 'Negotiating term length.'),
      (v_nw, 'Everest Slot 1 — signed 2026 term',    'won',          580000,  100,  array['everest'],    '2026-08-01', null, null),
      (v_hr, 'Dolomites onboarding package',         'onboarding',   180000,  100,  array['mont-blanc'], '2026-08-20', null, 'Signed; being set up.'),
      (v_cc, 'Chamonix winter placement — live term','active',       230000,  100,  array['mont-blanc'], '2026-07-01', null, 'Term runs to 31 Dec.'),
      (v_nw, 'Denali 2025 term — renewal window',    'renewal',      350000,  70,   array['denali'],     '2026-09-30', null, 'Renewal quote to send by mid-September.'),
      (v_ss, 'Kilimanjaro trial placement',          'lost',         240000,  0,    array[]::text[],     '2026-08-10', 'Chose to renew directly with their existing channel.', null);
  end if;

  /* ---- Tasks — the desk's open work ------------------------------------ */
  if not exists (select 1 from public.tasks where dedupe_key = 'seed-fill-1') then
    insert into public.tasks (kind, title, detail, company_id, desk, priority, status, due_on, dedupe_key) values
      ('contract_renewal',  'Everest placement renews in 30 days', 'Term ends 30 Sep; renewal conversation not yet opened.', v_nw, 'sales',      'high',   'open',        '2026-09-15', 'seed-fill-1'),
      ('document_expiring', 'Liability insurance expiring within 30 days',   'Printed expiry 20 Sep 2026.',                            v_cc, 'operations', 'high',   'open',        '2026-09-10', 'seed-fill-2'),
      ('unpaid_invoice',    'INV-2026-004 overdue 12 days',                  'Issued 30 Jul, due 14 Aug. No payment recorded.',        v_ss, 'finance',    'high',   'in_progress', '2026-09-02', 'seed-fill-3'),
      ('manual',            'Collect updated summit photography',            'Hollow Ridge sent low-resolution gallery images.',       v_hr, 'operations', 'normal', 'open',        '2026-09-20', 'seed-fill-4'),
      ('support_escalation','Slow replies on an operator thread',      'Two customer messages unanswered for four days.',        v_ss, 'support',    'normal', 'in_progress', '2026-09-03', 'seed-fill-5'),
      ('manual',            'Draft Q4 placement rate review',                'Quarterly Visibility Index review per framework §13.',   null, 'sales',      'low',    'open',        '2026-10-01', 'seed-fill-6');
  end if;

  /* ---- Revenue — placement fees recognised through 2026 ---------------- */
  if not exists (select 1 from public.revenue_records where note = 'seed:fill') then
    insert into public.revenue_records (stream, source_type, company_id, destination_id, amount_cents, status, recognised_on, period_start, period_end, note) values
      ('placement', 'manual', v_nw, 'everest',    92500, 'collected',     '2026-04-30', '2026-04-01', '2026-04-30', 'seed:fill'),
      ('placement', 'manual', v_nw, 'everest',    92500, 'collected',     '2026-05-31', '2026-05-01', '2026-05-31', 'seed:fill'),
      ('placement', 'manual', v_nw, 'everest',    92500, 'collected',     '2026-06-30', '2026-06-01', '2026-06-30', 'seed:fill'),
      ('placement', 'manual', v_ss, 'denali',     33500, 'collected',     '2026-05-31', '2026-05-01', '2026-05-31', 'seed:fill'),
      ('placement', 'manual', v_ss, 'denali',     33500, 'collected',     '2026-06-30', '2026-06-01', '2026-06-30', 'seed:fill'),
      ('placement', 'manual', v_ss, 'aconcagua',  31500, 'invoiced', '2026-07-31', '2026-07-01', '2026-07-31', 'seed:fill'),
      ('placement', 'manual', v_cc, 'mont-blanc', 26000, 'collected',     '2026-06-30', '2026-06-01', '2026-06-30', 'seed:fill'),
      ('placement', 'manual', v_cc, 'mont-blanc', 26000, 'invoiced', '2026-07-31', '2026-07-01', '2026-07-31', 'seed:fill'),
      ('placement', 'manual', v_cc, 'matterhorn', 24000, 'accrued',  '2026-08-31', '2026-08-01', '2026-08-31', 'seed:fill'),
      ('other',     'manual', v_hr, null,          9000, 'accrued',  '2026-08-31', null,         null,         'seed:fill');
  end if;

  /* ---- Invoices, lines, payments --------------------------------------- */
  if not exists (select 1 from public.invoices where number = 'INV-2026-001') then
    insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status, note)
      values ('INV-2026-001', v_nw, '2026-05-01', '2026-05-15', 277500, 277500, 'paid', 'seed') returning id into v_inv;
    insert into public.invoice_lines (invoice_id, description, source_type, unit_amount_cents, amount_cents, period_start, period_end)
      values (v_inv, 'Everest Featured Slot 1 — Apr to Jun 2026', 'manual', 92500, 277500, '2026-04-01', '2026-06-30');
    if v_admin is not null then
      insert into public.payments (invoice_id, company_id, amount_cents, received_on, method, reference, note, recorded_by)
        values (v_inv, v_nw, 277500, '2026-05-11', 'bank_transfer', 'seed NW-0511', 'seed', v_admin);
    end if;

    insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status, note)
      values ('INV-2026-002', v_ss, '2026-06-01', '2026-06-15', 67000, 67000, 'paid', 'seed') returning id into v_inv;
    insert into public.invoice_lines (invoice_id, description, source_type, unit_amount_cents, amount_cents, period_start, period_end)
      values (v_inv, 'Denali Featured Slot — May and Jun 2026', 'manual', 33500, 67000, '2026-05-01', '2026-06-30');
    if v_admin is not null then
      insert into public.payments (invoice_id, company_id, amount_cents, received_on, method, reference, note, recorded_by)
        values (v_inv, v_ss, 67000, '2026-06-09', 'bank_transfer', 'seed SS-0609', 'seed', v_admin);
    end if;

    insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status, note)
      values ('INV-2026-003', v_cc, '2026-07-01', '2026-07-15', 52000, 52000, 'issued', 'seed') returning id into v_inv;
    insert into public.invoice_lines (invoice_id, description, source_type, unit_amount_cents, amount_cents, period_start, period_end)
      values (v_inv, 'Mont Blanc Featured Slot — Jun and Jul 2026', 'manual', 26000, 52000, '2026-06-01', '2026-07-31');

    insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status, note)
      values ('INV-2026-004', v_ss, '2026-07-30', '2026-08-14', 31500, 31500, 'overdue', 'seed') returning id into v_inv;
    insert into public.invoice_lines (invoice_id, description, source_type, unit_amount_cents, amount_cents, period_start, period_end)
      values (v_inv, 'Aconcagua Featured Slot — Jul 2026', 'manual', 31500, 31500, '2026-07-01', '2026-07-31');

    insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status, note)
      values ('INV-2026-005', v_cc, '2026-08-25', '2026-09-08', 24000, 24000, 'draft', 'seed') returning id into v_inv;
    insert into public.invoice_lines (invoice_id, description, source_type, unit_amount_cents, amount_cents, period_start, period_end)
      values (v_inv, 'Matterhorn Featured Slot — Aug 2026', 'manual', 24000, 24000, '2026-08-01', '2026-08-31');
  end if;

  /* ---- Support tickets — company-side, no invented customers ----------- */
  insert into public.support_tickets (reference, subject, type, priority, status, company_id, opened_at, first_response_at, resolved_at, resolution) values
    ('TCK-2026-101', 'Gallery images rejected as too small',       'content',   'normal',   'waiting_on_company', v_hr, '2026-08-26 09:12+00', '2026-08-26 10:03+00', null, null),
    ('TCK-2026-102', 'Question about placement invoice line item', 'payment',   'normal',   'open',               v_ss, '2026-08-28 14:40+00', null, null, null),
    ('TCK-2026-103', 'Cannot update departure dates in portal',    'technical', 'high',     'investigating',      v_cc, '2026-08-29 08:05+00', '2026-08-29 08:44+00', null, null),
    ('TCK-2026-104', 'Request to change listed base-camp itinerary','content',  'low',      'resolved',           v_nw, '2026-08-20 11:00+00', '2026-08-20 12:10+00', '2026-08-22 16:30+00', 'Edit submitted through the approval flow and approved.'),
    ('TCK-2026-105', 'Safety incident report follow-up',           'safety',    'critical', 'investigating',      v_ss, '2026-08-29 17:55+00', '2026-08-29 18:02+00', null, null)
  on conflict (reference) do nothing;

  /* ---- Verification documents — states the truth can carry ------------- */
  if not exists (select 1 from public.verification_documents where note = 'seed:fill') then
    insert into public.verification_documents (company_id, document_type, label, issuer, issued_on, expires_on, expiry_source, state, note) values
      (v_nw, 'insurance',             'Public liability 2026–27',      'Alpine Mutual (invented)',   '2026-03-01', '2027-02-28', 'printed_on_document', 'pending', 'seed:fill'),
      (v_ss, 'business_registration', 'Company registration extract',  null,                         '2019-06-12', null,         null,                  'pending', 'seed:fill'),
      (v_cc, 'insurance',             'Public liability 2025–26',      'Mont Blanc Assurance (invented)', '2025-09-20', '2026-09-20', 'printed_on_document', 'pending', 'seed:fill'),
      (v_hr, 'licence',               'Guiding licence — Veneto',      null,                         '2026-01-15', '2027-01-15', 'stated_by_holder',    'pending', 'seed:fill'),
      (v_ss, 'certification',         'Wilderness first aid — team',   null,                         '2024-05-01', '2026-05-01', 'printed_on_document', 'pending', 'seed:fill'),
      (v_nw, 'other',                 'Sherpa employment policy',      null,                         null,         null,         null,                  'pending', 'seed:fill');
  end if;
end $$;

commit;
