-- Add the start boundary needed to render true project spans in the Team Hub
-- Gantt view. A task may remain partially scheduled while dates are being
-- collected, but complete ranges must run forward in time.

begin;

alter table public.division_tasks
  add column if not exists start_date date;

alter table public.division_tasks
  drop constraint if exists division_tasks_date_range_check;
alter table public.division_tasks
  add constraint division_tasks_date_range_check
  check (
    start_date is null
    or due_date is null
    or start_date <= due_date
  );

create index if not exists division_tasks_start_date_idx
  on public.division_tasks (start_date)
  where start_date is not null;

commit;
