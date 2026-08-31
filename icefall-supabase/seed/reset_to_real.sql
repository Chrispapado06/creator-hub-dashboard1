-- Remove every invented row, keep everything real.
--
-- The owner's instruction, 2026-08-30: "Everything that's fake, remove it for
-- now, like all of the fake expedition companies, all of the fake data. Remove
-- it so I can start building on it."
--
-- WHAT THIS DELETES: the 8 fictional companies and everything hanging off them
-- — deals, tasks, revenue, invoices, payments, support tickets, verification
-- documents, placements, products, memberships.
--
-- WHAT THIS KEEPS, and it is the majority of the value in the database:
--   · 304 destinations — 52 real mountains and 252 real treks, with real
--     elevations, generated from the apps' own catalogue. These are places, not
--     fiction, and the whole product joins onto their slugs.
--   · 51 trek→mountain links.
--   · 39 reserved usernames — the handle blocklist.
--   · auth.users and profiles — real accounts, including the owner's.
--   · audit_events — APPEND-ONLY BY DESIGN and deliberately not touched. It will
--     record these deletions, which is correct: "the invented companies were
--     removed on this date, by this actor" is exactly the kind of thing an audit
--     log exists to answer. Trying to erase that would be defeating the guard.
--
-- Children first: several foreign keys are `restrict` or `no action`, so the
-- order below is not cosmetic. Single transaction — all of it or none.

begin;

delete from public.support_ticket_messages;
delete from public.support_tickets;
delete from public.support_intake;

delete from public.invoice_lines;
delete from public.payments;
delete from public.credit_notes;
delete from public.invoices;
delete from public.revenue_records;
delete from public.commissions;

delete from public.tasks;
delete from public.deals;
delete from public.contracts;

delete from public.guide_certifications;
delete from public.verification_documents;

delete from public.company_notes;
delete from public.conversation_notes;
delete from public.company_internal;

delete from public.product_departures;
delete from public.product_destinations;
delete from public.products;
delete from public.placements;
delete from public.company_destinations;
delete from public.company_users;

delete from public.leads;
delete from public.bookings;

delete from public.content_versions;
delete from public.media_assets;

-- Last: the companies themselves. The audit trigger records each removal, and
-- the deletion succeeds because `audit_events.company_id` no longer carries
-- `on delete set null` — that FK was rewriting recorded history and was dropped
-- in 20260830130000. This is the first real use of that fix.
delete from public.companies;

commit;
