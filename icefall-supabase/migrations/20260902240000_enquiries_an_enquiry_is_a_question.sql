-- ICEFALL — an enquiry arrives as a QUESTION, never as an already-answered one.
--
-- FOUND BY GENERALISING a hole another session found in their own group schema,
-- which generalised a hole found in mine an hour earlier. The class, stated by
-- them and worth keeping in these words:
--
--   A COLUMN THAT ONLY ONE PARTY MAY EVER WRITE, ON A TABLE THE OTHER PARTY MAY
--   INSERT INTO. The decision belongs to the decider; the row is created by the
--   asker; so unless the asker's INSERT pins every decision column to NULL, the
--   asker writes the decider's answer.
--
-- They found it on `group_join_requests` (a requester could arrive with
-- `accepted_at` already set and seat themselves in any private group) and named
-- `enquiries` and `invitations` as the two places to look next. `invitations` is
-- clean — it has no INSERT policy at all, so every write goes through a definer
-- function. `enquiries` is NOT.
--
-- THE DEFECT. `enquiries_anon_insert` pins the sender's identity and nothing
-- else: sender_id is null, sender_kind = 'visitor', sender_email is not null.
-- The desk's seven decision columns — seen_at, seen_by, answered_at,
-- answered_by, answer, handed_off_at, handed_off_by — are unconstrained on the
-- one write path the public internet actually uses. `enquiries_guard` is BEFORE
-- UPDATE, so it never sees an INSERT, and the coherence CHECKs only require the
-- halves of a pair to agree with each other, not to be absent.
--
-- WHAT IT ALLOWS, and the second one is the serious one:
--
--   A FORGED ANSWER. An anonymous visitor inserts an enquiry carrying
--   `answered_at = now(), answered_by = <any profile id>, answer = 'Yes,
--   ICEFALL guarantees a summit'`. The CRM renders it in the answered list as
--   ICEFALL's own recorded reply, attributed to a named member of staff who
--   never wrote it. The screen is honest about everything it shows; what it
--   shows is a fabrication inserted from outside.
--
--   THE HAND-OFF DESK BYPASSED ENTIRELY. Setting `handed_off_at` on the way in
--   puts the row straight into `operator_enquiries`, which is defined as
--   "handed_off_at is not null AND is_company_member(company_id)". The company
--   the enquiry names then sees it immediately. The whole point of S4 is that a
--   named staff member decides, once, in their own name, and that the decision
--   is audited — and an anonymous insert skipped all three. (company_id itself
--   is safe: the BEFORE INSERT trigger resolves it from the referenced record,
--   so the visitor cannot choose WHICH company — only that some company gets it
--   without ICEFALL ever deciding to send it.)
--
-- TWO LAYERS, DELIBERATELY. The trigger is authoritative: it covers every
-- INSERT path that exists now or later, including any future policy somebody
-- adds without reading this file. The policy pin is defence in depth and fails
-- earlier with a clearer refusal. Neither alone is the right amount.
--
-- IT RAISES RATHER THAN SILENTLY NULLING. An insert claiming to be already
-- answered is not a client mistake to be tidied away; it is a forgery attempt,
-- and the log should say so.

/* ---- Layer 1: the trigger, authoritative over every path ---------------- */

create or replace function public.enquiries_arrive_undecided()
returns trigger
language plpgsql
as $$
begin
  if new.seen_at is not null or new.seen_by is not null then
    raise exception 'an enquiry cannot arrive already seen — seen is the desk''s record of reading it';
  end if;
  if new.answered_at is not null or new.answered_by is not null or new.answer is not null then
    raise exception 'an enquiry cannot arrive already answered — the answer is ICEFALL''s word, not the sender''s';
  end if;
  if new.handed_off_at is not null or new.handed_off_by is not null then
    raise exception 'an enquiry cannot arrive already handed off — passing it to a company is a decision a named staff member makes';
  end if;
  return new;
end;
$$;

-- Fires after `enquiries_resolve_object` (triggers run in name order, and
-- "arrive" sorts before "resolve"; both are BEFORE INSERT and neither depends
-- on the other's result, so the order is immaterial — stated so the next reader
-- does not have to work it out).
drop trigger if exists enquiries_arrive_undecided on public.enquiries;
create trigger enquiries_arrive_undecided
  before insert on public.enquiries
  for each row execute function public.enquiries_arrive_undecided();

/* ---- Layer 2: the policy says it too ------------------------------------ */

-- Restated whole. The three arms above the pins are the live ones, verbatim:
-- anonymous visitors are insert-only, forced into the visitor shape, and must
-- leave a way to be answered.
drop policy if exists enquiries_anon_insert on public.enquiries;
create policy enquiries_anon_insert on public.enquiries
  for insert to anon
  with check (
    sender_id is null
    and sender_kind = 'visitor'
    and sender_email is not null
    and seen_at is null and seen_by is null
    and answered_at is null and answered_by is null and answer is null
    and handed_off_at is null and handed_off_by is null
  );

comment on function public.enquiries_arrive_undecided() is
  'An enquiry is a question. Every column that records what ICEFALL DID about it — seen, answered, handed off — belongs to the desk, and an insert that carries one is refused whatever path it came in on.';
