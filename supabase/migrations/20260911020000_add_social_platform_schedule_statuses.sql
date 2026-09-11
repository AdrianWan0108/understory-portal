-- Track whether each selected social channel has been scheduled separately.
-- publishing_status remains scheduled only when every selected channel is marked.

begin;

alter table public.tasks
  add column if not exists platform_schedule_statuses jsonb not null default '{}'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_platform_schedule_statuses_object_check;
alter table public.tasks
  add constraint tasks_platform_schedule_statuses_object_check check (
    jsonb_typeof(platform_schedule_statuses) = 'object'
  );

update public.tasks as task
set platform_schedule_statuses = (
  select coalesce(
    jsonb_object_agg(btrim(channel), to_jsonb(true)),
    '{}'::jsonb
  )
  from regexp_split_to_table(coalesce(task.platform, ''), E'\\s*,\\s*') as channel
  where btrim(channel) <> ''
)
where task.publishing_status = 'scheduled'
  and task.platform_schedule_statuses = '{}'::jsonb;

commit;
