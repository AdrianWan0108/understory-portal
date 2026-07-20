-- Per-slide visual reference links (Pinterest/Instagram/other), shown as a
-- small grid under each social post slide. RLS stays the same permissive
-- "allow all" shape used across the rest of this app — task_slides/tasks
-- already work this way from the client with the anon key.

begin;

create table if not exists public.slide_references (
  id uuid primary key default gen_random_uuid(),
  task_slide_id uuid not null
    references public.task_slides(id) on delete cascade,
  url text not null,
  platform text not null default 'other',
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.slide_references
  drop constraint if exists slide_references_platform_check;
alter table public.slide_references
  add constraint slide_references_platform_check check (
    platform in ('pinterest', 'instagram', 'other')
  );

alter table public.slide_references enable row level security;

drop policy if exists "Allow all slide reference access"
  on public.slide_references;
create policy "Allow all slide reference access"
  on public.slide_references
  for all
  using (true)
  with check (true);

create index if not exists slide_references_task_slide_idx
  on public.slide_references (task_slide_id, created_at);

commit;
