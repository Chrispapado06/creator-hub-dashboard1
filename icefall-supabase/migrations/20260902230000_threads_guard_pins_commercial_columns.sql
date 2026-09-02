-- ICEFALL — a thread cannot be re-filed under a different company.
--
-- FOUND BY ADVERSARIAL AUDIT of the applied 20260831140000_messaging.sql, and
-- it is a defect in that file's own terms. `threads_guard` pins the objective —
-- peak, dates, party size, creator, kind — and its docstring says:
--
--     "What may change on a thread after creation: `status` ... `title` ...
--      and `last_message_at` ... Everything else IS the enquiry."
--
-- Five columns added later by 20260828120000_crm_commercial.sql are not in the
-- pin list: company_id, product_id, destination_id, source_page and
-- product_name_at_creation. `threads_update` lets any participant update any
-- column and `grant update on public.threads to authenticated` stands, so the
-- docstring states a guarantee the function does not enforce — the same shape
-- of defect this project keeps finding: a comment that describes a defence
-- nobody built.
--
-- WHAT IT ALLOWS TODAY, concretely, with company_id the load-bearing one:
--
--   LEAD THEFT / LOSS OF EMPLOYER VISIBILITY. A company rep who is a
--   participant in an enquiry addressed to their employer runs
--   `update threads set company_id = null`. The company arm of `threads_select`
--   stops matching, so the thread leaves every colleague's and manager's inbox;
--   the company arm of `thread_participants_insert` stops matching, so no other
--   member can join; there is no DELETE policy on `thread_participants`, so the
--   rep cannot be evicted. They keep the customer, privately, and no audit row
--   records any of it.
--
--   MISFILING INTO AN UNRELATED COMPANY. Any participant may set company_id to
--   a company they have nothing to do with. That company's whole active roster
--   can then see the thread row — peak, dates, party size, title — and each of
--   them may self-join through the company arm, after which `messages_select`
--   hands them the correspondence.
--
-- HONEST SCOPE, per the verifiers: this is not a brand-new read path, because
-- `thread_participants_insert` already lets any participant add any profile to
-- a thread by design. What is new is doing it to a WHOLE COMPANY AT ONCE,
-- silently, and being able to hide a live commercial conversation from the
-- employer it belongs to. It is an access-control and record-integrity defect,
-- not an outsider-reads-private-mail defect, and it is worth closing on both
-- counts.
--
-- The sibling migration written the same day already pins exactly these
-- columns on its own table (20260831150000_enquiry_delivery.sql, enquiries_guard
-- pins product_id, destination_id and company_id), which is why this reads as
-- an oversight rather than a trade-off.
--
-- ONE TRANSITION STAYS OPEN, DELIBERATELY. company_id may go from NULL to a
-- value exactly once — a thread that was never filed can still be attached to
-- the company it turns out to belong to, which is a real operations need. It
-- may never be changed to a different company, and it may never be cleared.
-- Both attacks above require one of the two forbidden transitions.
--
-- The trigger is unchanged; only the function it calls is replaced.

create or replace function public.threads_guard()
returns trigger
language plpgsql
as $$
begin
  if new.peak_name is distinct from old.peak_name
     or new.peak_elevation_m is distinct from old.peak_elevation_m
     or new.from_date is distinct from old.from_date
     or new.to_date is distinct from old.to_date
     or new.group_size is distinct from old.group_size
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.kind is distinct from old.kind then
    raise exception 'the objective is the record of what was asked — it does not change under the conversation';
  end if;

  -- Retitling is a group affordance. On a two-party or enquiry thread the
  -- title is derived from who is in it; a client writing one would be writing
  -- the other party's label.
  if new.title is distinct from old.title and old.kind <> 'group' then
    raise exception 'only a group thread can be retitled';
  end if;

  -- The commercial filing is part of the record too. Added here rather than in
  -- the original because these columns arrived on the table in a later
  -- migration than the guard.
  if new.product_id is distinct from old.product_id
     or new.destination_id is distinct from old.destination_id
     or new.source_page is distinct from old.source_page
     or new.product_name_at_creation is distinct from old.product_name_at_creation then
    raise exception 'what this thread was about does not change under the conversation';
  end if;

  -- company_id: attachable once, never moved, never cleared.
  if new.company_id is distinct from old.company_id then
    if old.company_id is not null then
      raise exception 'a thread cannot be re-filed under a different company, or unfiled — that would move a live conversation out of its company''s sight';
    end if;
    if new.company_id is null then
      raise exception 'a thread cannot be unfiled from its company';
    end if;
  end if;

  return new;
end;
$$;
