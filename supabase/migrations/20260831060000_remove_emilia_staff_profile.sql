-- Remove Emilia as a staff member and purge data owned by that identity.
-- Shared project work is retained but no longer assigned to her.

begin;

update public.tasks
set
  assignee_usernames = array_remove(
    assignee_usernames,
    'Understory_Emilia'
  ),
  assigned_to = case
    when lower(btrim(coalesce(assigned_to, ''))) in (
      'emilia',
      'understory_emilia'
    ) then null
    else assigned_to
  end;

update public.website_tasks
set
  assignee_usernames = array_remove(
    assignee_usernames,
    'Understory_Emilia'
  ),
  assigned_to = case
    when lower(btrim(coalesce(assigned_to, ''))) in (
      'emilia',
      'understory_emilia'
    ) then null
    else assigned_to
  end;

update public.division_tasks
set assignee_usernames = array_remove(
  assignee_usernames,
  'Understory_Emilia'
);

update public.division_task_items
set assignee_usernames = array_remove(
  assignee_usernames,
  'Understory_Emilia'
);

delete from public.assistant_usage
where team_username = 'Understory_Emilia';

delete from public.assistant_conversations
where team_username = 'Understory_Emilia';

delete from public.team_activity_log
where lower(btrim(actor)) in ('emilia', 'understory_emilia');

delete from public.team_documents
where owner_username = 'Understory_Emilia';

-- Remove owner document and payroll references before deleting invoice rows,
-- whose profile foreign key intentionally restricts.
delete from public.team_documents as document
using public.staff_invoices as invoice
where invoice.staff_username = 'Understory_Emilia'
  and document.file_url =
    '/api/team-hub/payroll/invoices/' || invoice.id::text || '/pdf';

delete from public.team_payroll
where staff_username = 'Understory_Emilia';

delete from public.staff_invoices
where staff_username = 'Understory_Emilia';

-- Private payment details, budgets, time entries, and contractor settings
-- cascade from the profile.
delete from public.profiles
where team_username = 'Understory_Emilia';

commit;
