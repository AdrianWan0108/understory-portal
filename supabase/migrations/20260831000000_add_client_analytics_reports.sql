-- Monthly Analytics reports backed by Google Slides, with optional Loom
-- walkthroughs and client-facing messages.

begin;

create table if not exists public.client_analytics_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  report_month date not null,
  google_slides_url text not null,
  loom_url text,
  message text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_analytics_reports enable row level security;

drop policy if exists "Allow all client analytics report access"
  on public.client_analytics_reports;
create policy "Allow all client analytics report access"
  on public.client_analytics_reports
  for all
  using (true)
  with check (true);

create unique index if not exists client_analytics_reports_client_month_idx
  on public.client_analytics_reports (client_id, report_month);

create index if not exists client_analytics_reports_published_month_idx
  on public.client_analytics_reports
  (client_id, is_published, report_month desc);

commit;
