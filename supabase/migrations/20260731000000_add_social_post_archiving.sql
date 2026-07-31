-- Archive social posts after they have been published without discarding their
-- approval history or removing them from the content calendar.

begin;

alter table public.tasks
  add column if not exists posted_at timestamptz;
alter table public.tasks
  add column if not exists posted_by text;

create index if not exists tasks_social_posted_at_idx
  on public.tasks (internal_approval_task_id, posted_at)
  where posted_at is not null;

commit;
