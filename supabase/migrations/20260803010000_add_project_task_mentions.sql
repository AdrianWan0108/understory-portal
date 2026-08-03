-- Store explicit @mentions separately from assignment and owner watchers so
-- every team member can see a dedicated Mentions queue on their dashboard.

begin;

alter table public.division_tasks
  add column if not exists mentioned_usernames text[]
    not null default '{}'::text[];

alter table public.division_task_items
  add column if not exists mentioned_usernames text[]
    not null default '{}'::text[];

create index if not exists division_tasks_mentioned_usernames_idx
  on public.division_tasks using gin (mentioned_usernames);

create index if not exists division_task_items_mentioned_usernames_idx
  on public.division_task_items using gin (mentioned_usernames);

commit;
