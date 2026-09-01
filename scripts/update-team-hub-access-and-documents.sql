-- Run this entire file once in the Supabase SQL Editor before testing the
-- Team Hub project assignments, payroll invoices, or Documents page.
-- It is safe to run again.
--
-- DEVELOPMENT PROTOTYPE ONLY: access is enforced in the app layer. Replace
-- these permissive policies with Supabase Auth and role-based RLS before
-- production.

begin;

insert into public.clients (name, slug)
values ('Red House Vision Centre', 'red-house')
on conflict (slug) do nothing;

alter table public.website_tasks
  add column if not exists assigned_to text;

alter table public.tasks
  add column if not exists assigned_to text;

alter table public.website_tasks
  add column if not exists assignee_usernames text[]
    not null default '{}'::text[];

alter table public.tasks
  add column if not exists assignee_usernames text[]
    not null default '{}'::text[];

alter table public.tasks
  add column if not exists watcher_usernames text[]
    not null default array[
      'Understory_Karen',
      'Understory_Adrian'
    ]::text[];

-- Preserve recognized active staff assignments when migrating old rows.
update public.tasks
set assigned_to = assignee
where assigned_to is null
  and assignee in ('Arion', 'Sure');

update public.website_tasks
set assignee_usernames = array[
  case lower(btrim(assigned_to))
    when 'karen' then 'Understory_Karen'
    when 'adrian' then 'Understory_Adrian'
    when 'arion' then 'Understory_Arion'
    when 'sure' then 'Understory_Sure'
  end
]
where cardinality(assignee_usernames) = 0
  and lower(btrim(assigned_to)) in (
    'karen', 'adrian', 'arion', 'sure'
  );

update public.tasks
set assignee_usernames = array[
  case lower(btrim(assigned_to))
    when 'karen' then 'Understory_Karen'
    when 'adrian' then 'Understory_Adrian'
    when 'arion' then 'Understory_Arion'
    when 'sure' then 'Understory_Sure'
  end
]
where cardinality(assignee_usernames) = 0
  and lower(btrim(assigned_to)) in (
    'karen', 'adrian', 'arion', 'sure'
  );

create index if not exists website_tasks_client_assigned_to_idx
  on public.website_tasks (client_id, assigned_to);

create index if not exists tasks_client_assigned_to_idx
  on public.tasks (client_id, assigned_to);

create index if not exists website_tasks_assignee_usernames_idx
  on public.website_tasks using gin (assignee_usernames);

create index if not exists tasks_assignee_usernames_idx
  on public.tasks using gin (assignee_usernames);

create index if not exists tasks_watcher_usernames_idx
  on public.tasks using gin (watcher_usernames);

create table if not exists public.team_payroll (
  id uuid primary key default gen_random_uuid(),
  staff_username text not null,
  amount numeric(12, 2),
  status text check (status in ('pending', 'paid')),
  pay_period text,
  invoice_file_url text,
  created_at timestamptz default now()
);

alter table public.team_payroll
  add column if not exists invoice_file_url text;

alter table public.team_payroll enable row level security;

drop policy if exists "Allow all team payroll access"
  on public.team_payroll;
create policy "Allow all team payroll access"
  on public.team_payroll
  for all
  using (true)
  with check (true);

create index if not exists team_payroll_staff_created_at_idx
  on public.team_payroll (staff_username, created_at desc);

insert into public.team_payroll (
  staff_username,
  amount,
  status,
  pay_period
)
select
  seeded.staff_username,
  seeded.amount,
  seeded.status,
  seeded.pay_period
from (
  values
    ('Understory_Arion', 1500::numeric, 'paid', 'June 2026'),
    ('Understory_Sure', 800::numeric, 'pending', 'July 2026')
) as seeded(staff_username, amount, status, pay_period)
where not exists (
  select 1
  from public.team_payroll existing
  where existing.staff_username = seeded.staff_username
    and existing.pay_period = seeded.pay_period
);

insert into storage.buckets (id, name, public)
values ('payroll-invoices', 'payroll-invoices', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view payroll invoices"
  on storage.objects;
create policy "Public can view payroll invoices"
  on storage.objects
  for select
  to public
  using (bucket_id = 'payroll-invoices');

drop policy if exists "Public can upload payroll invoices"
  on storage.objects;
create policy "Public can upload payroll invoices"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'payroll-invoices');

drop policy if exists "Public can delete payroll invoices"
  on storage.objects;
create policy "Public can delete payroll invoices"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'payroll-invoices');

insert into storage.buckets (id, name, public)
values ('team-documents', 'team-documents', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view team documents"
  on storage.objects;
create policy "Public can view team documents"
  on storage.objects
  for select
  to public
  using (bucket_id = 'team-documents');

drop policy if exists "Public can upload team documents"
  on storage.objects;
create policy "Public can upload team documents"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'team-documents');

drop policy if exists "Public can delete team documents"
  on storage.objects;
create policy "Public can delete team documents"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'team-documents');

create table if not exists public.team_documents (
  id uuid primary key default gen_random_uuid(),
  owner_username text not null,
  file_url text not null,
  document_name text not null,
  category text,
  created_at timestamptz default now()
);

alter table public.team_documents enable row level security;

drop policy if exists "Allow all team document access"
  on public.team_documents;
create policy "Allow all team document access"
  on public.team_documents
  for all
  using (true)
  with check (true);

create index if not exists team_documents_owner_created_at_idx
  on public.team_documents (owner_username, created_at desc);

commit;
