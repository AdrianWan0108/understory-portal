-- Store structured Story interaction instructions separately from captions and
-- visual direction so production can reproduce polls, stickers, and prompts.

begin;

alter table public.tasks
  add column if not exists story_interaction jsonb not null
  default '{"type":"none","prompt":"","options":[]}'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_story_interaction_object_check;
alter table public.tasks
  add constraint tasks_story_interaction_object_check check (
    jsonb_typeof(story_interaction) = 'object'
  );

commit;
