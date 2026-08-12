-- Social content-calendar items live in `tasks`, so they need their own
-- timeline dates in addition to the publishing timestamp.

begin;

alter table public.tasks
  add column if not exists start_date date,
  add column if not exists due_date date;

update public.tasks
set due_date = scheduled_at::date
where due_date is null
  and scheduled_at is not null;

alter table public.tasks
  drop constraint if exists tasks_timeline_date_range_check;
alter table public.tasks
  add constraint tasks_timeline_date_range_check
  check (
    start_date is null
    or due_date is null
    or start_date <= due_date
  );

create index if not exists tasks_timeline_due_date_idx
  on public.tasks (due_date)
  where due_date is not null;

commit;
