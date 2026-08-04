-- Event task items can carry a Google Drive visual alongside their name and
-- description. Other divisions keep this column empty.

begin;

alter table public.division_task_items
  add column if not exists visual_url text;

commit;
