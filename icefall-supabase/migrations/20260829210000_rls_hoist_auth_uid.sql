-- Wrap every bare `auth.uid()` in an RLS policy as `(select auth.uid())`.
--
-- WHAT THIS CHANGES: nothing about who can see what. `auth.uid()` and
-- `(select auth.uid())` return the same value in the same session. This is a
-- planner instruction, not a rule change.
--
-- WHY IT MATTERS. Called bare inside a policy, `auth.uid()` is evaluated once
-- PER ROW the policy is checked against. Wrapped in a scalar subquery it becomes
-- an InitPlan: evaluated once for the whole query and reused. On a ten-row table
-- the difference is unmeasurable. On `messages` at ten thousand users it is the
-- difference between a query and an outage, and the failure arrives suddenly —
-- the plan is fine until the table is big enough for the per-row cost to
-- dominate, then it is not.
--
-- 30 of 97 policies were affected.
--
-- GENERATED AND VERIFIED AGAINST THE LIVE CATALOG. Each policy was read back
-- from `pg_policies`, rewritten, and re-read; the check is that stripping the
-- wrapping from the new expression reproduces the old expression EXACTLY, for
-- every policy, including the ones this migration does not touch. A rewrite of
-- the security boundary is worth proving rather than trusting, because the
-- failure mode of a subtly altered policy is silent: it does not error, it just
-- shows somebody a row that is not theirs.
--
-- WHAT THIS DOES NOT FIX. The policies also dispatch through SECURITY DEFINER
-- helpers — `is_company_member(company_id)`, `is_thread_participant(thread_id)`
-- — that take a COLUMN as an argument and therefore genuinely must run per row;
-- no wrapping can hoist those. Making those cheap needs a different change
-- (caching the membership set per statement, or restructuring the policy around
-- a join), and it is the next thing to do after this.

begin;

drop policy if exists "audit_events_insert" on public.audit_events;
create policy "audit_events_insert" on public.audit_events as permissive for insert to authenticated
  with check ((is_staff() AND (actor_id = ( select auth.uid() ))));

drop policy if exists "blocks_own" on public.blocks;
create policy "blocks_own" on public.blocks as permissive for all to authenticated
  using ((blocker_id = ( select auth.uid() )))
  with check ((blocker_id = ( select auth.uid() )));

drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings as permissive for select to authenticated
  using ((is_staff() OR ((company_id IS NOT NULL) AND is_company_member(company_id)) OR (customer_id = ( select auth.uid() ))));

drop policy if exists "company_notes_all" on public.company_notes;
create policy "company_notes_all" on public.company_notes as permissive for all to authenticated
  using (is_staff())
  with check ((is_staff() AND (author_id = ( select auth.uid() ))));

drop policy if exists "company_users_select" on public.company_users;
create policy "company_users_select" on public.company_users as permissive for select to authenticated
  using ((is_staff() OR (profile_id = ( select auth.uid() )) OR is_company_member(company_id)));

drop policy if exists "conversation_notes_delete" on public.conversation_notes;
create policy "conversation_notes_delete" on public.conversation_notes as permissive for delete to authenticated
  using (((author_id = ( select auth.uid() )) OR has_staff_role(ARRAY['super_admin'::text])));

drop policy if exists "conversation_notes_insert" on public.conversation_notes;
create policy "conversation_notes_insert" on public.conversation_notes as permissive for insert to authenticated
  with check (((author_id = ( select auth.uid() )) AND (is_staff() OR is_company_member(company_id))));

drop policy if exists "guide_certifications_select" on public.guide_certifications;
create policy "guide_certifications_select" on public.guide_certifications as permissive for select to authenticated
  using ((is_staff() OR (guide_profile_id = ( select auth.uid() ))));

drop policy if exists "guide_certifications_write" on public.guide_certifications;
create policy "guide_certifications_write" on public.guide_certifications as permissive for all to authenticated
  using ((has_staff_role(ARRAY['operations'::text]) OR (guide_profile_id = ( select auth.uid() ))))
  with check ((has_staff_role(ARRAY['operations'::text]) OR (guide_profile_id = ( select auth.uid() ))));

drop policy if exists "guide_profiles_select" on public.guide_profiles;
create policy "guide_profiles_select" on public.guide_profiles as permissive for select to authenticated
  using ((listed OR (id = ( select auth.uid() )) OR is_admin()));

drop policy if exists "guide_profiles_write" on public.guide_profiles;
create policy "guide_profiles_write" on public.guide_profiles as permissive for all to authenticated
  using (((id = ( select auth.uid() )) OR is_admin()))
  with check (((id = ( select auth.uid() )) OR is_admin()));

drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads as permissive for select to authenticated
  using ((is_staff() OR is_company_member(company_id) OR (customer_id = ( select auth.uid() ))));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages as permissive for insert to authenticated
  with check (((sender_id = ( select auth.uid() )) AND is_thread_participant(thread_id) AND (NOT blocked_in_thread(thread_id)) AND may_write_to_thread(thread_id)));

drop policy if exists "operator_notifications_select" on public.operator_notifications;
create policy "operator_notifications_select" on public.operator_notifications as permissive for select to authenticated
  using (((profile_id = ( select auth.uid() )) OR is_staff()));

drop policy if exists "operator_notifications_update" on public.operator_notifications;
create policy "operator_notifications_update" on public.operator_notifications as permissive for update to authenticated
  using ((profile_id = ( select auth.uid() )))
  with check ((profile_id = ( select auth.uid() )));

drop policy if exists "operator_profiles_select" on public.operator_profiles;
create policy "operator_profiles_select" on public.operator_profiles as permissive for select to authenticated
  using ((listed OR (id = ( select auth.uid() )) OR is_admin()));

drop policy if exists "operator_profiles_write" on public.operator_profiles;
create policy "operator_profiles_write" on public.operator_profiles as permissive for all to authenticated
  using (((id = ( select auth.uid() )) OR is_admin()))
  with check (((id = ( select auth.uid() )) OR is_admin()));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles as permissive for insert to authenticated
  with check (((id = ( select auth.uid() )) AND (role = 'athlete'::icefall_role)));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles as permissive for update to authenticated
  using (((id = ( select auth.uid() )) OR is_admin()))
  with check ((((id = ( select auth.uid() )) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = ( select auth.uid() ))))) OR is_admin()));

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports as permissive for insert to authenticated
  with check ((reporter_id = ( select auth.uid() )));

drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports as permissive for select to authenticated
  using (((reporter_id = ( select auth.uid() )) OR is_admin()));

drop policy if exists "support_ticket_messages_insert" on public.support_ticket_messages;
create policy "support_ticket_messages_insert" on public.support_ticket_messages as permissive for insert to authenticated
  with check (((author_id = ( select auth.uid() )) AND (is_staff() OR ((internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_messages.ticket_id) AND (t.requester_id = ( select auth.uid() )))))))));

drop policy if exists "support_ticket_messages_select" on public.support_ticket_messages;
create policy "support_ticket_messages_select" on public.support_ticket_messages as permissive for select to authenticated
  using ((is_staff() OR ((internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_ticket_messages.ticket_id) AND (t.requester_id = ( select auth.uid() ))))))));

drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets as permissive for select to authenticated
  using ((is_staff() OR (requester_id = ( select auth.uid() ))));

drop policy if exists "thread_participants_insert" on public.thread_participants;
create policy "thread_participants_insert" on public.thread_participants as permissive for insert to authenticated
  with check ((is_admin() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_participants.thread_id) AND (t.created_by = ( select auth.uid() ))))) OR is_thread_participant(thread_id) OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_participants.thread_id) AND (t.company_id IS NOT NULL) AND is_company_member(t.company_id) AND (thread_participants.profile_id = ( select auth.uid() )))))));

drop policy if exists "thread_participants_select" on public.thread_participants;
create policy "thread_participants_select" on public.thread_participants as permissive for select to authenticated
  using (((profile_id = ( select auth.uid() )) OR is_thread_participant(thread_id) OR is_admin()));

drop policy if exists "thread_participants_update_self" on public.thread_participants;
create policy "thread_participants_update_self" on public.thread_participants as permissive for update to authenticated
  using ((profile_id = ( select auth.uid() )))
  with check ((profile_id = ( select auth.uid() )));

drop policy if exists "threads_insert" on public.threads;
create policy "threads_insert" on public.threads as permissive for insert to authenticated
  with check ((created_by = ( select auth.uid() )));

drop policy if exists "verification_documents_insert" on public.verification_documents;
create policy "verification_documents_insert" on public.verification_documents as permissive for insert to authenticated
  with check ((has_staff_role(ARRAY['operations'::text]) OR ((state = 'pending'::text) AND (checked_by IS NULL) AND (checked_at IS NULL) AND (((company_id IS NOT NULL) AND is_company_admin(company_id)) OR (guide_profile_id = ( select auth.uid() ))))));

drop policy if exists "verification_documents_select" on public.verification_documents;
create policy "verification_documents_select" on public.verification_documents as permissive for select to authenticated
  using ((is_staff() OR ((company_id IS NOT NULL) AND is_company_member(company_id)) OR (guide_profile_id = ( select auth.uid() ))));

commit;
