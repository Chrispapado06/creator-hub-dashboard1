-- Index every foreign key that had no index.
--
-- WHY. Postgres indexes a PRIMARY KEY automatically and a FOREIGN KEY not at
-- all. That surprises people, because the foreign key looks like the database
-- has been told about the relationship — and it has, for integrity, but not for
-- lookup. 75 foreign keys in this schema had no index behind them.
--
-- It costs twice:
--
--   1. Every read that filters by the key is a sequential scan. `messages` by
--      `sender_id`, `bookings` by `customer_id`, `leads` by `customer_id` — the
--      exact columns that grow one row per user action.
--   2. Every DELETE on the PARENT scans the whole child table, because Postgres
--      must find the referencing rows to cascade, null out or refuse. Deleting
--      one profile scans every table that points at profiles. Seven of these are
--      `on delete restrict` or `no action`, where the scan happens purely to
--      decide whether to raise an error.
--
-- Cost (2) is the one that bites first, and it bites hardest on the operation
-- nobody load-tests: account deletion. A user exercising their right to be
-- deleted should not take the database down.
--
-- GENERATED FROM THE LIVE CATALOG, not from reading the migrations. The query
-- asks pg_constraint for every foreign key and pg_index for every non-partial
-- index whose leading columns are a prefix of that key. Deriving it from the
-- database rather than by eye is the point: a hand-kept list of "the indexes we
-- meant to add" is exactly the artefact that goes stale.
--
-- PARTIAL INDEXES DELIBERATELY DO NOT COUNT AS COVERAGE. `messages` had a
-- unique index on (sender_id, client_id) `where client_id is not null`, and
-- `operator_notifications` one on profile_id `where read_at is null`. Neither can
-- serve a general lookup: the first skips every message without a client id, the
-- second every notification already read. A partial index that answers some of
-- the queries reads as coverage in a schema review and is not.
--
-- `if not exists` throughout, so this is safe to re-run.

begin;

create index if not exists idx_analytics_events_destination_id on public.analytics_events (destination_id);
create index if not exists idx_analytics_events_lead_id on public.analytics_events (lead_id);
create index if not exists idx_analytics_events_product_id on public.analytics_events (product_id);
create index if not exists idx_analytics_events_thread_id on public.analytics_events (thread_id);
create index if not exists idx_bookings_customer_id on public.bookings (customer_id);
create index if not exists idx_bookings_destination_id on public.bookings (destination_id);
create index if not exists idx_bookings_disputed_by on public.bookings (disputed_by);
create index if not exists idx_bookings_product_id on public.bookings (product_id);
create index if not exists idx_bookings_thread_id on public.bookings (thread_id);
create index if not exists idx_commission_rules_created_by on public.commission_rules (created_by);
create index if not exists idx_commission_rules_scope_company_id on public.commission_rules (scope_company_id);
create index if not exists idx_commission_rules_scope_product_id on public.commission_rules (scope_product_id);
create index if not exists idx_commission_rules_scope_profile_id on public.commission_rules (scope_profile_id);
create index if not exists idx_commissions_invoice_id on public.commissions (invoice_id);
create index if not exists idx_commissions_rule_id on public.commissions (rule_id);
create index if not exists idx_companies_banner_media_id on public.companies (banner_media_id);
create index if not exists idx_companies_billing_contact_id on public.companies (billing_contact_id);
create index if not exists idx_companies_documents_checked_by on public.companies (documents_checked_by);
create index if not exists idx_company_destinations_granted_by on public.company_destinations (granted_by);
create index if not exists idx_company_destinations_video_media_id on public.company_destinations (video_media_id);
create index if not exists idx_company_internal_account_owner_id on public.company_internal (account_owner_id);
create index if not exists idx_company_notes_author_id on public.company_notes (author_id);
create index if not exists idx_content_versions_reviewed_by on public.content_versions (reviewed_by);
create index if not exists idx_content_versions_submitted_by on public.content_versions (submitted_by);
create index if not exists idx_contracts_created_by on public.contracts (created_by);
create index if not exists idx_contracts_deal_id on public.contracts (deal_id);
create index if not exists idx_conversation_notes_author_id on public.conversation_notes (author_id);
create index if not exists idx_conversation_notes_company_id on public.conversation_notes (company_id);
create index if not exists idx_credit_notes_company_id on public.credit_notes (company_id);
create index if not exists idx_credit_notes_issued_by on public.credit_notes (issued_by);
create index if not exists idx_deals_owner_id on public.deals (owner_id);
create index if not exists idx_guide_certifications_checked_by on public.guide_certifications (checked_by);
create index if not exists idx_guide_certifications_document_id on public.guide_certifications (document_id);
create index if not exists idx_invitations_accepted_by on public.invitations (accepted_by);
create index if not exists idx_invitations_invited_by on public.invitations (invited_by);
create index if not exists idx_invoice_lines_commission_id on public.invoice_lines (commission_id);
create index if not exists idx_invoice_lines_placement_id on public.invoice_lines (placement_id);
create index if not exists idx_invoices_created_by on public.invoices (created_by);
create index if not exists idx_leads_company_id_assigned_to on public.leads (company_id, assigned_to);
create index if not exists idx_leads_booking_id on public.leads (booking_id);
create index if not exists idx_leads_customer_id on public.leads (customer_id);
create index if not exists idx_leads_destination_id on public.leads (destination_id);
create index if not exists idx_leads_product_id on public.leads (product_id);
create index if not exists idx_media_assets_product_id on public.media_assets (product_id);
create index if not exists idx_media_assets_reviewed_by on public.media_assets (reviewed_by);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_operator_notifications_company_id on public.operator_notifications (company_id);
create index if not exists idx_operator_notifications_profile_id on public.operator_notifications (profile_id);
create index if not exists idx_payments_recorded_by on public.payments (recorded_by);
create index if not exists idx_placements_changed_by on public.placements (changed_by);
create index if not exists idx_placements_created_by on public.placements (created_by);
create index if not exists idx_placements_deal_id on public.placements (deal_id);
create index if not exists idx_placements_destination_id on public.placements (destination_id);
create index if not exists idx_reports_reporter_id on public.reports (reporter_id);
create index if not exists idx_reports_subject_id on public.reports (subject_id);
create index if not exists idx_reports_thread_id on public.reports (thread_id);
create index if not exists idx_revenue_records_commission_id on public.revenue_records (commission_id);
create index if not exists idx_revenue_records_destination_id on public.revenue_records (destination_id);
create index if not exists idx_revenue_records_invoice_id on public.revenue_records (invoice_id);
create index if not exists idx_revenue_records_placement_id on public.revenue_records (placement_id);
create index if not exists idx_revenue_records_product_id on public.revenue_records (product_id);
create index if not exists idx_staff_members_invited_by on public.staff_members (invited_by);
create index if not exists idx_support_ticket_messages_author_id on public.support_ticket_messages (author_id);
create index if not exists idx_support_tickets_assigned_to on public.support_tickets (assigned_to);
create index if not exists idx_support_tickets_booking_id on public.support_tickets (booking_id);
create index if not exists idx_support_tickets_lead_id on public.support_tickets (lead_id);
create index if not exists idx_support_tickets_requester_id on public.support_tickets (requester_id);
create index if not exists idx_tasks_assigned_to on public.tasks (assigned_to);
create index if not exists idx_tasks_company_id on public.tasks (company_id);
create index if not exists idx_tasks_resolved_by on public.tasks (resolved_by);
create index if not exists idx_threads_created_by on public.threads (created_by);
create index if not exists idx_threads_destination_id on public.threads (destination_id);
create index if not exists idx_threads_product_id on public.threads (product_id);
create index if not exists idx_verification_documents_checked_by on public.verification_documents (checked_by);
create index if not exists idx_verification_documents_media_asset_id on public.verification_documents (media_asset_id);
commit;
