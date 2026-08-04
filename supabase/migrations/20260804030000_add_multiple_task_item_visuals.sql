-- Event and branding task items can include multiple Google Drive visuals.
-- Keep visual_url as the first visual for backwards compatibility with older
-- clients and existing queries.

begin;

alter table public.division_task_items
  add column if not exists visual_urls text[] not null default '{}'::text[];

update public.division_task_items
set visual_urls = array[visual_url]
where visual_url is not null
  and cardinality(visual_urls) = 0;

commit;
