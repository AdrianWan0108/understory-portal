-- Add a canonical deadline to the project records used by the Team Hub
-- timeline. Content briefs retain their template JSON for compatibility, but
-- their existing due dates are copied here when they are valid ISO dates.

begin;

alter table public.division_tasks
  add column if not exists due_date date;

update public.division_tasks
set due_date = to_date(content_brief_data->>'due_date', 'YYYY-MM-DD')
where due_date is null
  and template_type = 'content_brief'
  and content_brief_data->>'due_date'
    ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
  and to_char(
    to_date(content_brief_data->>'due_date', 'YYYY-MM-DD'),
    'YYYY-MM-DD'
  ) = content_brief_data->>'due_date';

create index if not exists division_tasks_due_date_idx
  on public.division_tasks (due_date)
  where due_date is not null;

commit;
