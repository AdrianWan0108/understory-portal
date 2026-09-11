-- Store a separate publishing date and time for every selected social channel.
-- scheduled_at remains the earliest channel time for calendar ordering and
-- backwards-compatible reminders.

begin;

alter table public.tasks
  add column if not exists platform_schedules jsonb not null default '{}'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_platform_schedules_object_check;
alter table public.tasks
  add constraint tasks_platform_schedules_object_check check (
    jsonb_typeof(platform_schedules) = 'object'
  );

update public.tasks as task
set platform_schedules = (
  select coalesce(
    jsonb_object_agg(btrim(channel), to_jsonb(task.scheduled_at)),
    '{}'::jsonb
  )
  from regexp_split_to_table(coalesce(task.platform, ''), E'\\s*,\\s*') as channel
  where btrim(channel) <> ''
)
where task.scheduled_at is not null
  and task.platform_schedules = '{}'::jsonb;

commit;
