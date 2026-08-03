-- Extend @mentions to website and social-media project workspaces so mentions
-- authored anywhere in Projects can appear on the recipient's dashboard.

begin;

alter table public.website_tasks
  add column if not exists mentioned_usernames text[]
    not null default '{}'::text[];

alter table public.tasks
  add column if not exists mentioned_usernames text[]
    not null default '{}'::text[];

create index if not exists website_tasks_mentioned_usernames_idx
  on public.website_tasks using gin (mentioned_usernames);

create index if not exists tasks_mentioned_usernames_idx
  on public.tasks using gin (mentioned_usernames);

commit;
