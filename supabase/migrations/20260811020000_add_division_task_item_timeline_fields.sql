-- Give individual project items their own workflow and schedule so the
-- Projects Gantt can operate at item level rather than parent-task level.

begin;

alter table public.division_task_items
  add column if not exists status text not null default 'planning',
  add column if not exists start_date date,
  add column if not exists due_date date;

update public.division_task_items as item
set
  status = case
    when item.completed then 'approved'
    else parent.status
  end,
  start_date = coalesce(item.start_date, parent.start_date),
  due_date = coalesce(item.due_date, parent.due_date)
from public.division_tasks as parent
where parent.id = item.division_task_id;

alter table public.division_task_items
  drop constraint if exists division_task_items_status_check;
alter table public.division_task_items
  add constraint division_task_items_status_check
  check (status in ('planning', 'production', 'review', 'approved'));

alter table public.division_task_items
  drop constraint if exists division_task_items_date_range_check;
alter table public.division_task_items
  add constraint division_task_items_date_range_check
  check (
    start_date is null
    or due_date is null
    or start_date <= due_date
  );

create index if not exists division_task_items_due_date_idx
  on public.division_task_items (due_date)
  where due_date is not null;

create index if not exists division_task_items_status_idx
  on public.division_task_items (status);

commit;
