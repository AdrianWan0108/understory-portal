begin;

alter table public.tasks
  add column if not exists creative_drive_link text;

commit;
