-- Store a separate post caption for every selected social channel.
-- post_caption remains the first selected channel caption for backwards
-- compatibility with existing integrations.

begin;

alter table public.tasks
  add column if not exists platform_captions jsonb not null default '{}'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_platform_captions_object_check;
alter table public.tasks
  add constraint tasks_platform_captions_object_check check (
    jsonb_typeof(platform_captions) = 'object'
  );

update public.tasks as task
set platform_captions = (
  select coalesce(
    jsonb_object_agg(btrim(channel), to_jsonb(task.post_caption)),
    '{}'::jsonb
  )
  from regexp_split_to_table(coalesce(task.platform, ''), E'\\s*,\\s*') as channel
  where btrim(channel) <> ''
)
where coalesce(task.post_caption, '') <> ''
  and task.platform_captions = '{}'::jsonb;

commit;
