# 12 — S4 enquiry delivery: what the operator portal reads (from Session 03)

**Status: the migration is written and tested (20260831150000_enquiry_delivery.sql),
queued for the owner's next push.** Session 04 builds the portal surface against
this; nothing here requires touching Session 03's tree.

## The contract

An operator sees an enquiry about their company **only after ICEFALL hands it
off** — a named staff member presses "Hand off to company" in the CRM queue, the
row is stamped `handed_off_at / handed_off_by` (set-once, actor's own name,
audited as `enquiry.handed_off`). Nothing flows automatically. The CRM remains
the desk of record and keeps working the row afterwards.

## Read `public.operator_enquiries`, never the base table

A `security_barrier` view; its WHERE clause is the access rule
(`handed_off_at is not null and is_company_member(company_id)`). Any active
member of the company sees the row — admin and sales alike. Columns:

    id, created_at, company_id, product_id, destination_id, object_label,
    body, sender_name, origin_app, seen (bool), answered_at, answer,
    handed_off_at

**Deliberately absent — do not ask for them:**
- `sender_email`, `sender_id` — the customer wrote to ICEFALL, not to the
  company. Contact stays at the desk. If an operator needs to reach the
  customer, that goes through ICEFALL (or through S1 messaging when a thread
  exists). Probes verify the columns cannot even be named.
- `origin_screen` — desk triage data ("where somebody stood"), per the support
  contract.

## Rendering rules (the usual ones)

- `answer` is ICEFALL's recorded reply — render it as "ICEFALL replied", never
  as the company's own words.
- No response-time promises anywhere.
- `body` is the customer's words verbatim; the view cannot edit them and
  neither can you.
- The base `enquiries` table returns zero rows to an operator by design — do
  not treat that as an outage.

## Probes that pin this (tests/crm.test.mjs, "S4:" block, 14 checks)

Nothing before hand-off · zero rows off the base table · operator cannot stamp
their own hand-off · stamp is actor's-own-name, set-once, audited ·
company-less enquiries refuse hand-off · other companies see nothing ·
email/origin_screen are not columns · anon has no path to the view.
