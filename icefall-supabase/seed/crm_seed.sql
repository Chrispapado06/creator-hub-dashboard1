-- ICEFALL — CRM seed data.
--
-- APPLIED DELIBERATELY, NEVER BUNDLED. This is a file somebody runs against a
-- development database, not a module the application imports. `icefall-admin`
-- takes the other approach — 203 lines of invented revenue compiled into the
-- app behind a banner — and the banner is then the only thing standing between a
-- reader and a number they might repeat in a meeting. The CRM shows the reason a
-- figure is missing instead, so it needs no fallback data at all.
--
-- EVERY COMPANY BELOW IS INVENTED. Real expedition operators are real
-- businesses: attaching invented prices, placements and commercial terms to one
-- is a live exposure, and the product owner has ruled that fictional names are
-- used everywhere, seed data included. Do not "improve" this file by
-- substituting a real operator, and note that the internal CRM specification's
-- own worked example names one — it should not be copied in.
--
-- THE MOUNTAINS ARE REAL, and that is correct: real peaks with published
-- elevations, keyed by the slugs `icefall-app` and `icefall-web` already use, so
-- the consumer surfaces join straight onto these rows.
--
-- NOTHING HERE IS VERIFIED. Not one company carries `verification_status =
-- 'verified'`, because verification means documents were checked by a person on
-- a real date and the seed has no such date to offer. A coherence constraint
-- would reject a verified company with no reviewer anyway — this file simply
-- does not try. That is the shape the doctrine takes here.

begin;

/* -------------------------------------------------------------------------- */
/* Mountains — real peaks, real elevations, existing slugs                    */
/* -------------------------------------------------------------------------- */

insert into public.destinations (id, name, range, region, country, elevation_m) values
  ('everest',     'Mount Everest', 'Mahalangur Himal', 'Himalaya & Asia', 'Nepal / China',  8849),
  ('denali',      'Denali',        'Alaska Range',     'Americas',        'United States',  6190),
  ('aconcagua',   'Aconcagua',     'Andes',            'Americas',        'Argentina',      6961),
  ('mont-blanc',  'Mont Blanc',    'Graian Alps',      'Europe',          'France / Italy', 4806),
  ('matterhorn',  'Matterhorn',    'Pennine Alps',     'Europe',          'Switzerland / Italy', 4478)
on conflict (id) do nothing;

/* -------------------------------------------------------------------------- */
/* Companies — invented, every one                                            */
/* -------------------------------------------------------------------------- */

insert into public.companies (id, slug, name, description, countries, regions, status, verification_status) values
  ('11111111-1111-4111-8111-111111111111', 'northwind-ascents', 'Northwind Ascents',
   'Invented operator used for development. High-altitude expeditions.',
   array['Nepal'], array['Himalaya & Asia'], 'active', 'pending'),
  ('22222222-2222-4222-8222-222222222222', 'serac-and-stone', 'Serac & Stone Expeditions',
   'Invented operator used for development. Andean and Alaskan programmes.',
   array['Argentina', 'United States'], array['Americas'], 'active', 'unverified'),
  ('33333333-3333-4333-8333-333333333333', 'cairn-and-compass', 'Cairn & Compass Trekking',
   'Invented operator used for development. Alpine trekking.',
   array['France', 'Switzerland'], array['Europe'], 'active', 'unverified'),
  ('44444444-4444-4444-8444-444444444444', 'hollow-ridge', 'Hollow Ridge Mountaineering',
   'Invented operator used for development. Currently in onboarding.',
   array['Italy'], array['Europe'], 'onboarding', 'unverified')
on conflict (id) do nothing;

insert into public.company_internal (company_id, source, priority, tags, notes) values
  ('11111111-1111-4111-8111-111111111111', 'inbound', 'high', array['himalaya'],
   'Development seed. Not a real account.'),
  ('22222222-2222-4222-8222-222222222222', 'outbound', 'normal', array['andes'],
   'Development seed. Not a real account.')
on conflict (company_id) do nothing;

/* -------------------------------------------------------------------------- */
/* Mountain assignments — the AUTHORIZATION boundary, separate from placement  */
/* -------------------------------------------------------------------------- */

insert into public.company_destinations (company_id, destination_id) values
  ('11111111-1111-4111-8111-111111111111', 'everest'),
  ('11111111-1111-4111-8111-111111111111', 'denali'),
  ('22222222-2222-4222-8222-222222222222', 'aconcagua'),
  ('22222222-2222-4222-8222-222222222222', 'denali'),
  ('33333333-3333-4333-8333-333333333333', 'mont-blanc'),
  ('33333333-3333-4333-8333-333333333333', 'matterhorn'),
  ('44444444-4444-4444-8444-444444444444', 'mont-blanc')
on conflict do nothing;

/* -------------------------------------------------------------------------- */
/* Placements — all five positions on Everest, plus a deliberate expiry        */
/* -------------------------------------------------------------------------- */

-- Inserted directly because a seed runs as the service role and has no
-- `auth.uid()` to attribute an audit event to. In the running system these rows
-- can only be created by `public.create_placement(...)`, which writes the audit
-- event as part of the same statement — `authenticated` holds SELECT and
-- nothing else on this table.
--
-- Position #4 has already run out. It is left exactly as it is, occupying its
-- slot, because that is the behaviour being demonstrated: expiry flags a
-- placement for an administrator and never vacates or reassigns it.
insert into public.placements
  (company_id, destination_id, slot_position, starts_on, ends_on, status, price_cents) values
  ('11111111-1111-4111-8111-111111111111', 'everest', 1,
   current_date - 30,  current_date + 335, 'active', 1200000),
  ('22222222-2222-4222-8222-222222222222', 'everest', 2,
   current_date - 60,  current_date + 305, 'active',  900000),
  ('33333333-3333-4333-8333-333333333333', 'everest', 3,
   current_date - 10,  current_date + 355, 'active',  700000),
  ('44444444-4444-4444-8444-444444444444', 'everest', 4,
   current_date - 400, current_date - 35,  'active',  700000),
  -- #5 is reserved but not yet started: a hold, which still occupies the slot.
  ('22222222-2222-4222-8222-222222222222', 'everest', 5,
   current_date + 14,  current_date + 379, 'reserved', null),
  ('33333333-3333-4333-8333-333333333333', 'mont-blanc', 1,
   current_date - 20,  current_date + 345, 'active',  400000),
  -- Price not yet agreed. NULL, not 0 — an unpriced placement is not a free one.
  ('22222222-2222-4222-8222-222222222222', 'aconcagua', 1,
   current_date - 5,   current_date + 360, 'active',  null)
on conflict do nothing;

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

-- Three price states, deliberately. An expedition is quoted rather than priced
-- off a card, so `on_request` and `unknown` are ordinary outcomes — and the
-- database refuses to store a figure alongside either of them.
insert into public.products
  (id, company_id, kind, slug, name, summary, price_from_cents, price_state, currency,
   duration_days_min, duration_days_max, max_altitude_m, availability_state, status, live_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'expedition', 'everest-south-col', 'Everest — South Col',
   'Invented listing used for development.', 6200000, 'known', 'EUR', 60, 65, 8849, 'limited', 'live', now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'trek', 'khumbu-approach', 'Khumbu Approach Trek',
   'Invented listing used for development.', null, 'unknown', 'EUR', 12, 14, 5364, 'unknown', 'draft', null),
  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'expedition', 'aconcagua-normal', 'Aconcagua — Normal Route',
   'Invented listing used for development.', null, 'on_request', 'EUR', 18, 21, 6961, 'available', 'live', now()),
  ('aaaaaaaa-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
   'trek', 'tour-du-mont-blanc', 'Tour du Mont Blanc',
   'Invented listing used for development.', 185000, 'known', 'EUR', 10, 11, 2665, 'available', 'live', now())
on conflict (id) do nothing;

insert into public.product_destinations (product_id, destination_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'everest'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'everest'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aconcagua'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'mont-blanc')
on conflict do nothing;

-- Availability is the operator's own operational fact and they write it
-- directly; the date and price beside it are advertised claims and move only
-- through approval. `spots_left` is NULL on the last row on purpose: "not
-- stated" and "sold out" are different statements.
insert into public.product_departures
  (product_id, departure_date, end_date, price_cents, availability, spots_total, spots_left) values
  ('aaaaaaaa-0000-4000-8000-000000000001', current_date + 240, current_date + 302, 6200000, 'limited', 12, 3),
  ('aaaaaaaa-0000-4000-8000-000000000003', current_date + 150, current_date + 170, null, 'available', 10, 8),
  ('aaaaaaaa-0000-4000-8000-000000000004', current_date + 90,  current_date + 100, 185000, 'unknown', null, null)
on conflict do nothing;

/* -------------------------------------------------------------------------- */
/* A change waiting on review                                                 */
/* -------------------------------------------------------------------------- */

-- Two pending versions on ONE product, touching different fields, which is the
-- granularity the specification requires: approving the price must not drag the
-- summary back into review. A third version touching `price_from_cents` again
-- would be refused, naming the clash.
insert into public.content_versions
  (entity_type, entity_id, company_id, payload, base_snapshot, state, submitted_at) values
  ('product', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '{"price_from_cents": 5900000}'::jsonb,
   '{"price_from_cents": 6200000}'::jsonb, 'pending', now() - interval '2 days'),
  ('product', 'aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '{"summary": "Invented listing used for development. Revised wording awaiting review."}'::jsonb,
   '{"summary": "Invented listing used for development."}'::jsonb, 'pending', now() - interval '1 day')
on conflict do nothing;


/* -------------------------------------------------------------------------- */
/* Leads at every stage, and one booking                                      */
/* -------------------------------------------------------------------------- */

-- Needs a customer, and a customer is an auth user. Rather than forge rows in
-- `auth.users` — which is fragile and would leave a login nobody can use — this
-- borrows whatever athlete already exists and says so plainly when none does.
-- Sign up a test user first and re-run if you want this part.
do $$
declare
  v_customer uuid;
  v_thread   uuid;
  v_booking  uuid;
  v_company  uuid := '11111111-1111-4111-8111-111111111111';
  v_product  uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
begin
  select id into v_customer from public.profiles where role = 'athlete' order by created_at limit 1;

  if v_customer is null then
    raise notice 'No athlete profile exists yet — skipping the lead and booking seed.';
    raise notice 'Sign up one test user, then re-run this file to populate the funnel.';
    return;
  end if;

  -- One enquiry thread, so a lead has the conversation that produced it. The
  -- product name is captured now and does not follow a later rename.
  insert into public.threads (kind, peak_name, created_by, company_id, product_id,
                              product_name_at_creation, source_page)
  values ('enquiry', 'Everest', v_customer, v_company, v_product, 'Everest — South Col', 'product')
  returning id into v_thread;

  insert into public.thread_participants (thread_id, profile_id) values (v_thread, v_customer);

  -- Every stage the pipeline has, so the funnel screen can be judged populated.
  -- The timestamps are consistent with the stage: a `quoted` lead has been
  -- contacted and qualified, and a `new` one has nothing but a created date.
  insert into public.leads (company_id, customer_id, thread_id, product_id, destination_id, status,
                            source_page, contacted_at, qualified_at, quoted_at, lost_at, lost_reason)
  values
    (v_company, v_customer, v_thread, v_product, 'everest', 'new',       'product', null, null, null, null, null),
    (v_company, v_customer, null,     v_product, 'everest', 'contacted', 'mountain', now() - interval '6 days', null, null, null, null),
    (v_company, v_customer, null,     v_product, 'everest', 'qualified', 'mountain', now() - interval '9 days', now() - interval '7 days', null, null, null),
    (v_company, v_customer, null,     v_product, 'everest', 'quoted',    'product', now() - interval '14 days', now() - interval '12 days', now() - interval '9 days', null, null),
    (v_company, v_customer, null,     v_product, 'everest', 'lost',      'product', now() - interval '30 days', now() - interval '28 days', now() - interval '25 days', now() - interval '20 days', 'Chose a different operator.'),
    -- Recorded, but the value is not known. Pending, never zero.
    (v_company, v_customer, null,     v_product, 'everest', 'disputed',  'company', now() - interval '40 days', now() - interval '38 days', null, null, null);

  -- A booked lead with a real reported value, and its booking.
  insert into public.bookings (kind, company_id, product_id, destination_id, customer_id, thread_id,
                               status, value_status, value_cents, booked_at, starts_on)
  values ('expedition', v_company, v_product, 'everest', v_customer, v_thread,
          'confirmed', 'reported', 6200000, now() - interval '3 days', current_date + 240)
  returning id into v_booking;

  insert into public.leads (company_id, customer_id, thread_id, product_id, destination_id, status,
                            source_page, contacted_at, qualified_at, quoted_at, booked_at, booking_id)
  values (v_company, v_customer, v_thread, v_product, 'everest', 'booked', 'product',
          now() - interval '20 days', now() - interval '18 days', now() - interval '10 days',
          now() - interval '3 days', v_booking);

  -- A second booking whose value the operator has not reported yet. It exists,
  -- it is real, and its value is absent rather than zero — which is the state
  -- GMV has to exclude and say it excluded.
  insert into public.bookings (kind, company_id, product_id, destination_id, customer_id,
                               status, value_status, booked_at)
  values ('expedition', v_company, v_product, 'everest', v_customer,
          'reported', 'pending', now() - interval '1 day');
end
$$;

commit;

-- WHAT IS NOT SEEDED, AND WHY.
--
--   · No leads or bookings — those tables arrive with the next migration.
--   · NO COMMISSION RULE, and therefore no commissions and no referral revenue.
--     The specification asks for seeded commissions; it is deliberately not
--     satisfied, because the referral rate is an open owner decision and any
--     number here produces real-looking money on a revenue screen. There is no
--     "visibly marked placeholder" that survives being read off a dashboard as a
--     figure — the marking is in this file and the figure is on the screen.
--
--     What the seed demonstrates instead is the engine refusing: `record_commission`
--     raises "no referral commission rule is configured", which is the honest
--     state of the business and a better test of the code path than a fake rate
--     would be. Add one rule when the rate is decided and the whole layer fills
--     in — the rate is stored on each commission record, so no historical figure
--     moves afterwards.
--   · No verification. See the header.
--   · No view counts, enquiry counts or conversion rates. Nothing emits those
--     events yet, so the analytics screens read "unavailable" rather than 0%.
